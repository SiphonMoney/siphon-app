export type AppToastType = "success" | "error" | "info";

export type AppToastDetail = {
  message: string;
  type?: AppToastType;
  durationMs?: number;
};

const TOAST_EVENT = "siphon:app-toast";

export function showAppToast(
  message: string,
  type: AppToastType = "info",
  durationMs = 3200,
) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent<AppToastDetail>(TOAST_EVENT, {
      detail: { message, type, durationMs },
    }),
  );
}

export { TOAST_EVENT };
