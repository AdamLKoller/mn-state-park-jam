import { DriveEstimate } from "@/lib/types";

export function formatDriveTime(seconds: number): string {
  const totalMinutes = Math.round(seconds / 60);
  if (totalMinutes < 60) {
    return `${totalMinutes} min`;
  }
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return minutes ? `${hours} h ${minutes} min` : `${hours} h`;
}

export function formatDriveDistance(meters: number): string {
  return `${(meters / 1609.344).toFixed(1)} mi`;
}

export function formatDriveEstimate(estimate: DriveEstimate): string {
  return `${formatDriveTime(estimate.seconds)} · ${formatDriveDistance(estimate.meters)}`;
}
