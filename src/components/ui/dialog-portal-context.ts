import { createContext, useContext } from "react";

// Lets a page redirect where Radix Dialog/AlertDialog/Select portals render.
// Radix's default portal target is document.body — but the browser's native
// Fullscreen API (element.requestFullscreen()) only keeps the fullscreen
// element and its DOM descendants on screen. Anything portalled to
// document.body sits outside that subtree, so it becomes invisible and
// un-clickable the instant real fullscreen is active (this is what broke
// "New booking" and the booking-detail dialog in the Calendar's fullscreen
// mode). A page that uses requestFullscreen() wraps its tree in this
// context's Provider (value = the fullscreen element) so every dialog,
// alert-dialog and select rendered anywhere inside it — no matter how
// deeply nested in components it doesn't own — portals into that element
// instead, with zero changes needed at each call site.
export const PortalContainerContext = createContext<HTMLElement | null>(null);
export const usePortalContainer = () => useContext(PortalContainerContext);
