export default function PrivacyPage() {
  return (
    <main style={{ maxWidth: "900px", margin: "2rem auto", padding: "0 1rem 3rem" }}>
      <h1>Privacy and data use</h1>
      <p>
        MN State Park Jam stores only data needed for collaborative trip planning: profile basics (name/email from
        Google sign-in), friendships, trip content, and an optional home address.
      </p>
      <h2>Home address and drive routes</h2>
      <p>
        If you save a home address, it is geocoded to a latitude and longitude and stored with your profile. Trip
        members can see your display name, the approximate location of your home (a marker on the map), and the
        estimated drive distance, time, and route from your home to each park on a shared trip. Members do not
        receive your typed address.
      </p>
      <h2>Data retention and deletion</h2>
      <p>
        You can delete your account in-app; this removes your user record, friendship records, and your membership
        from shared trips.
      </p>
      <h2>Official reservation data</h2>
      <p>
        This app links to the official Minnesota DNR reservation portal for availability and booking. It does not
        scrape or replicate private reservation inventory systems.
      </p>
    </main>
  );
}
