// A drag handle between two panes: reports the pointer's position while dragging, and once when it is let go.

export const attachSplitter = (handle: HTMLElement, onMove: (event: PointerEvent) => void, onEnd: () => void): void => {
  handle.addEventListener("pointerdown", (event) => {
    event.preventDefault();
    handle.setPointerCapture(event.pointerId);
    const move = (moveEvent: PointerEvent): void => onMove(moveEvent);
    const end = (): void => {
      handle.removeEventListener("pointermove", move);
      handle.removeEventListener("pointerup", end);
      handle.removeEventListener("pointercancel", end);
      onEnd();
    };
    handle.addEventListener("pointermove", move);
    handle.addEventListener("pointerup", end);
    handle.addEventListener("pointercancel", end);
  });
};
