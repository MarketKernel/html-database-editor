// The installed page's side of its service worker: registered where the page carries <meta name="service-worker">,
// a waiting version announced by a button, activated only when the user presses it, the page reloaded once it has taken over.

const SERVICE_WORKER_META = 'meta[name="service-worker"]';
const CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000;
const BANNER_CLASS = "dm-update";

export const startPwaUpdates = (window: Window): void => {
  const meta = window.document.querySelector<HTMLMetaElement>(SERVICE_WORKER_META);
  const container = window.navigator.serviceWorker;
  if (meta === null || container === undefined) return;
  void window.navigator.storage?.persist?.();
  void container.register(meta.content).then((registration) => {
    const announce = (): void => {
      if (registration.waiting !== null && container.controller !== null) void showWaitingVersion(window, registration.waiting);
    };
    announce();
    registration.addEventListener("updatefound", () => {
      registration.installing?.addEventListener("statechange", announce);
    });
    window.setInterval(() => void registration.update(), CHECK_INTERVAL_MS);
    window.addEventListener("online", () => void registration.update());
  });
  let isReloading = false;
  container.addEventListener("controllerchange", () => {
    if (isReloading) return;
    isReloading = true;
    window.location.reload();
  });
};

const showWaitingVersion = async (window: Window, worker: ServiceWorker): Promise<void> => {
  const version = await askVersion(worker);
  const document = window.document;
  document.querySelector(`.${BANNER_CLASS}`)?.remove();
  const button = document.createElement("button");
  button.type = "button";
  button.className = `${BANNER_CLASS} dm-button dm-primary`;
  button.textContent = `db-manager ${version} is ready — Update`;
  Object.assign(button.style, { position: "fixed", right: "16px", bottom: "16px", zIndex: "3000", boxShadow: "var(--dm-shadow)" });
  button.addEventListener("click", () => worker.postMessage("activate"));
  document.body.append(button);
};

const askVersion = (worker: ServiceWorker): Promise<string> =>
  new Promise((resolve) => {
    const channel = new MessageChannel();
    channel.port1.onmessage = (event: MessageEvent<string>) => resolve(event.data);
    worker.postMessage("version", [channel.port2]);
  });
