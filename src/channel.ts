// Which build this is. The preview build (VITE_CHANNEL=preview, served at
// /Hearth-Habits/preview/) keeps its own save on the device and its own cloud
// copy, so testing Phase 2 never touches a Gate 1 tester's main game.

export type Channel = 'main' | 'preview';

export const CHANNEL: Channel = import.meta.env.VITE_CHANNEL === 'preview' ? 'preview' : 'main';
export const IS_PREVIEW = CHANNEL === 'preview';

/** The main app's save key (unchanged since Phase 1 so existing saves load). */
export const MAIN_STORAGE_KEY = 'hearth-habits:state:v1';
export const STORAGE_KEY = IS_PREVIEW ? 'hearth-habits:preview:state' : MAIN_STORAGE_KEY;

/** Cloud save document under users/{uid}/state/. */
export const CLOUD_DOC = IS_PREVIEW ? 'preview' : 'main';
