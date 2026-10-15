"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import {
  Auth,
  GoogleAuthProvider,
  User,
  onAuthStateChanged,
  signInWithPopup,
  signOut,
} from "firebase/auth";
import { ParkMap, ROUTE_COLORS } from "@/components/park-map";
import { formatDriveEstimate } from "@/lib/drive-distances";
import { getClientAuth } from "@/lib/firebase/client";
import {
  ParkCatalogItem,
  TripRecord,
  TripRouteMember,
  TripRouteResponse,
  UserAddress,
} from "@/lib/types";
import styles from "./page.module.css";

type FriendView = {
  id: string;
  status: "pending" | "accepted";
  requestedByEmail: string;
  friendEmail: string;
};

async function authFetch<T>(
  user: User,
  path: string,
  init?: RequestInit,
): Promise<T> {
  const idToken = await user.getIdToken();
  const response = await fetch(path, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      authorization: `Bearer ${idToken}`,
      ...(init?.headers ?? {}),
    },
  });

  if (!response.ok) {
    const payload = (await response.json().catch(() => ({}))) as {
      error?: string;
    };
    throw new Error(payload.error ?? `Request failed: ${response.status}`);
  }

  return (await response.json()) as T;
}

function describeMember(member: TripRouteMember): string {
  if (member.route) return formatDriveEstimate(member.route);
  if (!member.origin) return "No home address set";
  return member.error ?? "No route found";
}

function HomeContent() {
  const [user, setUser] = useState<User | null>(null);
  const [friends, setFriends] = useState<FriendView[]>([]);
  const [friendQuery, setFriendQuery] = useState("");
  const [friendSearchResults, setFriendSearchResults] = useState<
    {
      uid: string;
      displayName: string;
      maskedEmail: string;
      emailLower: string;
    }[]
  >([]);
  const [trips, setTrips] = useState<TripRecord[]>([]);
  const [parks, setParks] = useState<ParkCatalogItem[]>([]);
  const [panelOpen, setPanelOpen] = useState(true);
  const [tripTitle, setTripTitle] = useState("New Shared Trip");
  const [tripStartDate, setTripStartDate] = useState("2026-10-16");
  const [tripEndDate, setTripEndDate] = useState("2026-10-17");
  const [tripParkId, setTripParkId] = useState("interstate");
  const [inviteEmail, setInviteEmail] = useState("");
  const [message, setMessage] = useState("");
  const [activeTab, setActiveTab] = useState<"create" | "trips">("create");
  const [selectedTripId, setSelectedTripId] = useState<string | null>(null);
  const [excludedFriendEmails, setExcludedFriendEmails] = useState<string[]>(
    [],
  );
  const [addFriendsOpen, setAddFriendsOpen] = useState(false);
  const [addFriendSelection, setAddFriendSelection] = useState<string[]>([]);
  const [activeParkId, setActiveParkId] = useState<string | null>(null);
  const [routeResult, setRouteResult] = useState<{
    key: string;
    data?: TripRouteResponse;
    error?: string;
  } | null>(null);
  const [homeAddress, setHomeAddress] = useState<UserAddress | null>(null);
  const [homeAddressInput, setHomeAddressInput] = useState("");
  const firebaseClient = useMemo<{
    auth: Auth | null;
    error: string | null;
  }>(() => {
    try {
      return { auth: getClientAuth(), error: null };
    } catch (error) {
      return {
        auth: null,
        error:
          error instanceof Error
            ? error.message
            : "Firebase is not configured.",
      };
    }
  }, []);
  const clientAuth = firebaseClient.auth;
  const firebaseConfigError = firebaseClient.error;

  useEffect(() => {
    if (!clientAuth) {
      return;
    }

    return onAuthStateChanged(clientAuth, async (nextUser) => {
      setUser(nextUser);
      if (!nextUser) {
        setFriends([]);
        setTrips([]);
        return;
      }

      try {
        await authFetch(nextUser, "/api/auth/upsert", { method: "POST" });
        const [friendsPayload, tripsPayload] = await Promise.all([
          authFetch<{ friendships: FriendView[] }>(nextUser, "/api/friends"),
          authFetch<{ trips: TripRecord[] }>(nextUser, "/api/trips"),
          refreshParks(),
        ]);
        setFriends(friendsPayload.friendships);
        setTrips(
          tripsPayload.trips.sort((a, b) =>
            a.startDate.localeCompare(b.startDate),
          ),
        );
      } catch (error) {
        setMessage(
          error instanceof Error ? error.message : "Failed loading data",
        );
      }
    });
  }, [clientAuth]);

  async function refreshFriends(activeUser = user) {
    if (!activeUser) {
      return;
    }
    const payload = await authFetch<{ friendships: FriendView[] }>(
      activeUser,
      "/api/friends",
    );
    setFriends(payload.friendships);
  }

  async function refreshTrips(activeUser = user) {
    if (!activeUser) {
      return;
    }
    const payload = await authFetch<{ trips: TripRecord[] }>(
      activeUser,
      "/api/trips",
    );
    setTrips(
      payload.trips.sort((a, b) => a.startDate.localeCompare(b.startDate)),
    );
  }

  async function refreshParks() {
    const response = await fetch("/api/parks");
    const payload = (await response.json()) as { parks: ParkCatalogItem[] };
    setParks(payload.parks);
  }

  useEffect(() => {
    void refreshParks();
  }, []);

  useEffect(() => {
    if (!user) {
      return;
    }
    let cancelled = false;
    authFetch<{ address: UserAddress | null }>(user, "/api/account/address")
      .then((payload) => {
        if (cancelled) return;
        setHomeAddress(payload.address);
        setHomeAddressInput(payload.address?.label ?? "");
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setMessage(
            error instanceof Error ? error.message : "Unable to load address",
          );
        }
      });
    return () => {
      cancelled = true;
    };
  }, [user]);

  const homeUpdatedAt = homeAddress?.updatedAt ?? "";

  useEffect(() => {
    if (!user || !selectedTripId || !activeParkId) {
      return;
    }
    const key = `${selectedTripId}|${activeParkId}|${homeUpdatedAt}`;
    let cancelled = false;
    authFetch<TripRouteResponse>(
      user,
      `/api/trips/${selectedTripId}/distances?parkId=${encodeURIComponent(activeParkId)}`,
    )
      .then((data) => {
        if (!cancelled) setRouteResult({ key, data });
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setRouteResult({
            key,
            error:
              error instanceof Error ? error.message : "Unable to load routes",
          });
        }
      });
    return () => {
      cancelled = true;
    };
  }, [user, selectedTripId, activeParkId, homeUpdatedAt]);

  const myEmail = user?.email?.toLowerCase() ?? "";
  const acceptedFriends = useMemo(
    () => friends.filter((friend) => friend.status === "accepted"),
    [friends],
  );
  const pendingIncoming = useMemo(
    () =>
      friends.filter(
        (friend) =>
          friend.status === "pending" && friend.requestedByEmail !== myEmail,
      ),
    [friends, myEmail],
  );

  async function handleSignIn() {
    if (!clientAuth) {
      return;
    }
    try {
      const provider = new GoogleAuthProvider();
      provider.setCustomParameters({ prompt: "select_account" });
      await signInWithPopup(clientAuth, provider);
      setMessage("Signed in");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Sign in failed");
    }
  }

  async function handleSignOut() {
    if (!clientAuth) {
      return;
    }
    await signOut(clientAuth);
    setMessage("Signed out");
  }

  async function searchFriends() {
    if (!user || friendQuery.trim().length < 2) {
      return;
    }

    try {
      const payload = await authFetch<{
        users: {
          uid: string;
          displayName: string;
          maskedEmail: string;
          emailLower: string;
        }[];
      }>(user, `/api/friends/search?q=${encodeURIComponent(friendQuery)}`);
      setFriendSearchResults(payload.users);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Search failed");
    }
  }

  async function requestFriend(email: string) {
    if (!user) {
      return;
    }

    try {
      await authFetch(user, "/api/friends/request", {
        method: "POST",
        body: JSON.stringify({ email }),
      });
      setMessage(`Friend request sent to ${email}`);
      await refreshFriends();
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Unable to send friend request",
      );
    }
  }

  async function respondFriend(email: string, accept: boolean) {
    if (!user) {
      return;
    }

    try {
      await authFetch(user, "/api/friends/respond", {
        method: "POST",
        body: JSON.stringify({ email, accept }),
      });
      setMessage(
        accept ? `Connected with ${email}` : `Declined request from ${email}`,
      );
      await refreshFriends();
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Unable to respond to friend request",
      );
    }
  }

  async function createTrip() {
    if (!user) {
      return;
    }
    const memberEmails = acceptedFriends
      .map((friend) => friend.friendEmail)
      .filter((email) => !excludedFriendEmails.includes(email));

    try {
      const payload = await authFetch<{ ok: boolean; tripId: string }>(
        user,
        "/api/trips",
        {
          method: "POST",
          body: JSON.stringify({
            title: tripTitle,
            startDate: tripStartDate,
            endDate: tripEndDate,
            parkId: tripParkId,
            memberEmails,
          }),
        },
      );
      setMessage("Trip created");
      setExcludedFriendEmails([]);
      await refreshTrips();
      selectTrip(payload.tripId);
      setActiveTab("trips");
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Unable to create trip",
      );
    }
  }

  function toggleExcludedFriend(email: string) {
    setExcludedFriendEmails((current) =>
      current.includes(email)
        ? current.filter((item) => item !== email)
        : [...current, email],
    );
  }

  function toggleAddFriendSelection(email: string) {
    setAddFriendSelection((current) =>
      current.includes(email)
        ? current.filter((item) => item !== email)
        : [...current, email],
    );
  }

  function selectTrip(tripId: string) {
    setSelectedTripId(tripId);
    setAddFriendsOpen(false);
    setAddFriendSelection([]);
  }

  function clearTripSelection() {
    setSelectedTripId(null);
    setAddFriendsOpen(false);
    setAddFriendSelection([]);
  }

  function toggleAddFriends() {
    setAddFriendsOpen((open) => !open);
    setAddFriendSelection([]);
  }

  async function addFriendsToTrip(trip: TripRecord) {
    if (!user || !addFriendSelection.length) {
      return;
    }
    try {
      for (const email of addFriendSelection) {
        await authFetch(user, `/api/trips/${trip.id}/invite`, {
          method: "POST",
          body: JSON.stringify({ email }),
        });
      }
      setMessage(
        `Added ${addFriendSelection.length} friend${addFriendSelection.length === 1 ? "" : "s"} to ${trip.title}`,
      );
      setAddFriendSelection([]);
      setAddFriendsOpen(false);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to add friends");
    }
    await refreshTrips();
  }

  async function saveHomeAddress() {
    if (!user || !homeAddressInput.trim()) {
      return;
    }
    try {
      const payload = await authFetch<{ ok: boolean; address: UserAddress }>(
        user,
        "/api/account/address",
        {
          method: "POST",
          body: JSON.stringify({ label: homeAddressInput }),
        },
      );
      setHomeAddress(payload.address);
      setMessage("Home address saved");
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Unable to save home address",
      );
    }
  }

  async function toggleBooked(trip: TripRecord, parkIndex: number) {
    if (!user) {
      return;
    }
    const updatedParks = trip.parks.map((park, index) => {
      if (index !== parkIndex) {
        return park;
      }
      return {
        ...park,
        booked: !park.booked,
        bookingReference: !park.booked
          ? `Manual-${new Date().toISOString().slice(0, 10)}`
          : "",
      };
    });

    try {
      await authFetch(user, `/api/trips/${trip.id}`, {
        method: "PATCH",
        body: JSON.stringify({ parks: updatedParks }),
      });
      setMessage(`Updated booking status for ${trip.title}`);
      await refreshTrips();
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Unable to update booking status",
      );
    }
  }

  async function inviteToTrip(tripId: string) {
    if (!user || !inviteEmail.trim()) {
      return;
    }
    try {
      await authFetch(user, `/api/trips/${tripId}/invite`, {
        method: "POST",
        body: JSON.stringify({ email: inviteEmail }),
      });
      setMessage(`Invited ${inviteEmail}`);
      setInviteEmail("");
      await refreshTrips();
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Unable to invite member",
      );
    }
  }

  async function deleteAccount() {
    if (!user) {
      return;
    }
    if (!clientAuth) {
      return;
    }
    if (
      !window.confirm(
        "Delete your account and leave/remove your trips? This cannot be undone.",
      )
    ) {
      return;
    }
    try {
      await authFetch(user, "/api/account/delete", { method: "POST" });
      await signOut(clientAuth);
      setMessage("Account deleted.");
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Unable to delete account",
      );
    }
  }

  const routeKey =
    user && selectedTripId && activeParkId
      ? `${selectedTripId}|${activeParkId}|${homeUpdatedAt}`
      : null;
  const currentRoute =
    routeKey !== null && routeResult?.key === routeKey ? routeResult : null;
  const routeData = currentRoute?.data ?? null;
  const routeLoading = routeKey !== null && currentRoute === null;
  const activePark = parks.find((park) => park.id === activeParkId) ?? null;

  function addableFriendsFor(trip: TripRecord) {
    const memberEmails = trip.memberEmails.map((email) => email.toLowerCase());
    return acceptedFriends.filter(
      (friend) => !memberEmails.includes(friend.friendEmail.toLowerCase()),
    );
  }

  return (
    <div className={styles.shell}>
      <div className={styles.mapPane}>
        <ParkMap
          parks={parks}
          routes={routeData}
          onParkSelect={(park) => setActiveParkId(park.id)}
        />
        {activePark && (
          <aside className={styles.routeOverlay} aria-live="polite">
            <div className={styles.headerRow}>
              <strong>{activePark.name}</strong>
              <button
                className={styles.buttonSecondary}
                type="button"
                onClick={() => setActiveParkId(null)}
              >
                Close
              </button>
            </div>
            {user ? (
              <>
                <select
                  className={styles.select}
                  aria-label="Trip for drive routes"
                  value={selectedTripId ?? ""}
                  onChange={(event) =>
                    event.target.value
                      ? selectTrip(event.target.value)
                      : clearTripSelection()
                  }
                >
                  <option value="">Choose a trip</option>
                  {trips.map((trip) => (
                    <option value={trip.id} key={trip.id}>
                      {trip.title}
                    </option>
                  ))}
                </select>
                {!selectedTripId && (
                  <p className={styles.muted}>
                    Choose a trip to see the drive from each member.
                  </p>
                )}
                {routeLoading && (
                  <p className={styles.muted}>Calculating routes…</p>
                )}
                {currentRoute?.error && (
                  <p className={styles.routeError}>{currentRoute.error}</p>
                )}
                {routeData && (
                  <ul className={styles.routeList}>
                    {routeData.members.map((member, index) => (
                      <li className={styles.routeMember} key={member.email}>
                        <span
                          className={styles.routeSwatch}
                          style={{
                            background:
                              ROUTE_COLORS[index % ROUTE_COLORS.length],
                          }}
                          aria-hidden="true"
                        />
                        <span className={styles.routeMemberText}>
                          <strong>{member.displayName}</strong>
                          <span className={styles.muted}>
                            {describeMember(member)}
                          </span>
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </>
            ) : (
              <p className={styles.muted}>
                Sign in and choose a trip to see drive routes from each member.
              </p>
            )}
          </aside>
        )}
      </div>
      <aside className={panelOpen ? styles.panel : styles.panelCollapsed}>
        <button
          className={styles.panelToggle}
          type="button"
          aria-expanded={panelOpen}
          aria-label={panelOpen ? "Hide panel" : "Show panel"}
          title={panelOpen ? "Hide panel" : "Show panel"}
          onClick={() => setPanelOpen((open) => !open)}
        >
          <svg
            className={styles.panelToggleIcon}
            viewBox="0 0 24 24"
            width="14"
            height="14"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M9 6l6 6-6 6" />
          </svg>
        </button>
        <div className={styles.panelBody}>
          <section className={`${styles.card} ${styles.heroCard}`}>
            <div className={styles.headerRow}>
              <div className={styles.brand}>
                <span className={styles.brandMark} aria-hidden="true">
                  MN
                </span>
                <h1 className={styles.appTitle}>MN State Park Jam</h1>
              </div>
              {user ? (
                <button
                  className={styles.buttonSecondary}
                  onClick={handleSignOut}
                  type="button"
                >
                  Sign out
                </button>
              ) : (
                <button
                  className={styles.button}
                  onClick={handleSignIn}
                  type="button"
                >
                  Sign in with Google
                </button>
              )}
            </div>
            <p className={styles.muted}>
              Planner-first collaborative trips, friend connections, state-park
              stop planning, and manual booking status.
            </p>
            {user && (
              <div className={styles.buttonRow}>
                <span className={styles.pill}>Signed in as {user.email}</span>
                <button
                  className={styles.buttonSecondary}
                  onClick={deleteAccount}
                  type="button"
                >
                  Delete account
                </button>
                <a className={styles.buttonSecondary} href="/privacy">
                  Privacy & data use
                </a>
              </div>
            )}
          </section>

          {!!(message || firebaseConfigError) && (
            <section className={styles.banner}>
              {message || firebaseConfigError}
            </section>
          )}

          {user && (
            <>
              <div className={styles.tabs} role="tablist" aria-label="Trips">
                <button
                  className={
                    activeTab === "create" ? styles.tabActive : styles.tab
                  }
                  role="tab"
                  aria-selected={activeTab === "create"}
                  type="button"
                  onClick={() => setActiveTab("create")}
                >
                  Create trip
                </button>
                <button
                  className={
                    activeTab === "trips" ? styles.tabActive : styles.tab
                  }
                  role="tab"
                  aria-selected={activeTab === "trips"}
                  type="button"
                  onClick={() => setActiveTab("trips")}
                >
                  View trips
                </button>
              </div>

              {activeTab === "create" ? (
                <section className={styles.card}>
                  <h2 className={styles.sectionTitle}>Create a trip</h2>
                  <div className={styles.inputGrid}>
                    <input
                      className={styles.input}
                      value={tripTitle}
                      onChange={(event) => setTripTitle(event.target.value)}
                      placeholder="Trip title"
                    />
                    <input
                      className={styles.input}
                      type="date"
                      value={tripStartDate}
                      onChange={(event) => setTripStartDate(event.target.value)}
                    />
                    <input
                      className={styles.input}
                      type="date"
                      value={tripEndDate}
                      onChange={(event) => setTripEndDate(event.target.value)}
                    />
                    <select
                      className={styles.select}
                      value={tripParkId}
                      onChange={(event) => setTripParkId(event.target.value)}
                    >
                      {parks.map((park) => (
                        <option value={park.id} key={park.id}>
                          {park.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  <h3 className={styles.subTitle}>Friends on this trip</h3>
                  {acceptedFriends.length ? (
                    <div className={styles.checkList}>
                      {acceptedFriends.map((friend) => (
                        <label className={styles.checkRow} key={friend.id}>
                          <input
                            type="checkbox"
                            checked={
                              !excludedFriendEmails.includes(friend.friendEmail)
                            }
                            onChange={() =>
                              toggleExcludedFriend(friend.friendEmail)
                            }
                          />
                          {friend.friendEmail}
                        </label>
                      ))}
                    </div>
                  ) : (
                    <p className={styles.muted}>
                      Connect with friends below to add them to a trip.
                    </p>
                  )}

                  <div className={styles.buttonRow}>
                    <button
                      className={styles.button}
                      onClick={createTrip}
                      type="button"
                    >
                      Create trip
                    </button>
                  </div>
                </section>
              ) : (
                <section className={styles.card}>
                  <h2 className={styles.sectionTitle}>Your trips</h2>
                  <div className={styles.tripList}>
                    {trips.map((trip) => {
                      const isSelected = trip.id === selectedTripId;
                      return (
                        <article className={styles.card} key={trip.id}>
                          <div className={styles.headerRow}>
                            <strong>{trip.title}</strong>
                            <span className={styles.pill}>
                              {trip.startDate} → {trip.endDate}
                            </span>
                          </div>
                          <p className={styles.muted}>
                            Members: {trip.memberEmails.join(", ")}
                          </p>
                          <div className={styles.buttonRow}>
                            <button
                              className={
                                isSelected
                                  ? styles.button
                                  : styles.buttonSecondary
                              }
                              type="button"
                              aria-expanded={isSelected}
                              onClick={() =>
                                isSelected
                                  ? clearTripSelection()
                                  : selectTrip(trip.id)
                              }
                            >
                              {isSelected ? "Close trip" : "View trip"}
                            </button>
                          </div>

                          {isSelected && (
                            <>
                              <div className={styles.stopList}>
                                {trip.parks.map((stop, index) => (
                                  <article
                                    className={styles.card}
                                    key={`${trip.id}_${stop.parkId}_${index}`}
                                  >
                                    <strong>{stop.parkName}</strong>
                                    <span className={styles.muted}>
                                      {stop.arrivalDate} → {stop.departureDate}
                                    </span>
                                    <span
                                      className={
                                        stop.booked
                                          ? styles.pillSuccess
                                          : styles.pill
                                      }
                                    >
                                      {stop.booked ? "Booked" : "Not booked"}
                                    </span>
                                    <div className={styles.buttonRow}>
                                      <button
                                        className={styles.buttonSecondary}
                                        type="button"
                                        onClick={() => toggleBooked(trip, index)}
                                      >
                                        Toggle booked
                                      </button>
                                      <a
                                        className={styles.buttonSecondary}
                                        href={stop.parkInfoUrl}
                                        target="_blank"
                                        rel="noreferrer"
                                      >
                                        Park info
                                      </a>
                                      <a
                                        className={styles.buttonSecondary}
                                        href={stop.reservationUrl}
                                        target="_blank"
                                        rel="noreferrer"
                                      >
                                        Reserve on DNR portal
                                      </a>
                                    </div>
                                  </article>
                                ))}
                              </div>

                              {trip.creatorEmail === myEmail && (
                                <div className={styles.card}>
                                  <div className={styles.headerRow}>
                                    <h3 className={styles.subTitle}>
                                      Add friends
                                    </h3>
                                    <button
                                      className={styles.buttonSecondary}
                                      type="button"
                                      onClick={toggleAddFriends}
                                    >
                                      {addFriendsOpen ? "Cancel" : "Add friends"}
                                    </button>
                                  </div>
                                  {addFriendsOpen &&
                                    (addableFriendsFor(trip).length ? (
                                      <>
                                        <div className={styles.checkList}>
                                          {addableFriendsFor(trip).map(
                                            (friend) => (
                                              <label
                                                className={styles.checkRow}
                                                key={friend.id}
                                              >
                                                <input
                                                  type="checkbox"
                                                  checked={addFriendSelection.includes(
                                                    friend.friendEmail,
                                                  )}
                                                  onChange={() =>
                                                    toggleAddFriendSelection(
                                                      friend.friendEmail,
                                                    )
                                                  }
                                                />
                                                {friend.friendEmail}
                                              </label>
                                            ),
                                          )}
                                        </div>
                                        <div className={styles.buttonRow}>
                                          <button
                                            className={styles.button}
                                            type="button"
                                            disabled={!addFriendSelection.length}
                                            onClick={() => addFriendsToTrip(trip)}
                                          >
                                            Add selected
                                          </button>
                                        </div>
                                      </>
                                    ) : (
                                      <p className={styles.muted}>
                                        All your connections are already on
                                        this trip.
                                      </p>
                                    ))}
                                  <div className={styles.inputGrid}>
                                    <input
                                      className={styles.input}
                                      value={inviteEmail}
                                      onChange={(event) =>
                                        setInviteEmail(event.target.value)
                                      }
                                      placeholder="Invite by email"
                                    />
                                    <button
                                      className={styles.buttonSecondary}
                                      type="button"
                                      onClick={() => inviteToTrip(trip.id)}
                                    >
                                      Invite member
                                    </button>
                                  </div>
                                </div>
                              )}
                            </>
                          )}
                        </article>
                      );
                    })}
                    {!trips.length && (
                      <p className={styles.muted}>
                        No trips yet. Use Create trip to plan one.
                      </p>
                    )}
                  </div>
                </section>
              )}

              <section className={styles.card}>
                <h2 className={styles.sectionTitle}>Friends</h2>
                <div className={styles.inputGrid}>
                  <input
                    className={styles.input}
                    value={friendQuery}
                    onChange={(event) => setFriendQuery(event.target.value)}
                    placeholder="Search by display name or exact email"
                  />
                  <button
                    className={styles.button}
                    onClick={searchFriends}
                    type="button"
                  >
                    Search users
                  </button>
                </div>

                <div className={styles.friendList}>
                  {friendSearchResults.map((result) => (
                    <article className={styles.card} key={result.uid}>
                      <strong>{result.displayName}</strong>
                      <span className={styles.muted}>{result.maskedEmail}</span>
                      <button
                        className={styles.buttonSecondary}
                        onClick={() => requestFriend(result.emailLower)}
                        type="button"
                      >
                        Send request
                      </button>
                    </article>
                  ))}
                  {!friendSearchResults.length && (
                    <p className={styles.muted}>
                      Search to discover other users.
                    </p>
                  )}
                </div>

                <h3 className={styles.subTitle}>Incoming requests</h3>
                <div className={styles.friendList}>
                  {pendingIncoming.map((request) => (
                    <article className={styles.card} key={request.id}>
                      <strong>{request.friendEmail}</strong>
                      <div className={styles.buttonRow}>
                        <button
                          className={styles.button}
                          onClick={() =>
                            respondFriend(request.friendEmail, true)
                          }
                          type="button"
                        >
                          Accept
                        </button>
                        <button
                          className={styles.buttonSecondary}
                          onClick={() =>
                            respondFriend(request.friendEmail, false)
                          }
                          type="button"
                        >
                          Decline
                        </button>
                      </div>
                    </article>
                  ))}
                  {!pendingIncoming.length && (
                    <p className={styles.muted}>
                      No pending incoming requests.
                    </p>
                  )}
                </div>

                <h3 className={styles.subTitle}>Current connections</h3>
                <div className={styles.friendList}>
                  {acceptedFriends.map((friend) => (
                    <article className={styles.card} key={friend.id}>
                      <strong>{friend.friendEmail}</strong>
                      <span className={styles.pillSuccess}>Connected</span>
                    </article>
                  ))}
                  {!acceptedFriends.length && (
                    <p className={styles.muted}>No accepted friends yet.</p>
                  )}
                </div>
              </section>

              <section className={styles.card}>
                <h2 className={styles.sectionTitle}>Home address</h2>
                <p className={styles.muted}>
                  Used to estimate the drive from your home to each park. US
                  addresses only.
                </p>
                <div className={styles.inputGrid}>
                  <input
                    className={styles.input}
                    value={homeAddressInput}
                    onChange={(event) => setHomeAddressInput(event.target.value)}
                    placeholder="Street, city, state, ZIP"
                  />
                  <button
                    className={styles.button}
                    type="button"
                    onClick={saveHomeAddress}
                  >
                    Save address
                  </button>
                </div>
                {homeAddress && (
                  <p className={styles.muted}>
                    Saved: {homeAddress.matchedAddress}
                  </p>
                )}
              </section>
            </>
          )}

          <section className={styles.card}>
            <h2 className={styles.sectionTitle}>Minnesota state parks</h2>
            <p className={styles.muted}>
              Click a park on the map to see its units, trails, and official
              links, plus the drive and route from each member of the selected
              trip. Search for a park above the map to jump to it. Live unit
              availability is not publicly exposed by the DNR, so final
              availability and booking happen on the DNR reservation system.
            </p>
          </section>
        </div>
      </aside>
    </div>
  );
}

export default function Home() {
  return (
    <Suspense fallback={null}>
      <HomeContent />
    </Suspense>
  );
}
