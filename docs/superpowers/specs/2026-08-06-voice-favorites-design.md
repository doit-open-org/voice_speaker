# Voice Favorites Design

## Goal

Add authenticated voice favorites to `pages/voiceSelect/voiceSelect` while keeping voice preview and selection behavior unchanged.

## User Experience

- Add `我的收藏` as the first sidebar entry.
- Keep the original first voice category selected when the page opens.
- Show a star button on every voice item. A favorite star uses `#E20E0E`; a non-favorite star uses light gray.
- Do not change the star or favorites list until the add or remove request returns business code `200`.
- Prevent repeated favorite actions for the same voice while its request is pending.
- A successful add immediately inserts the voice into `我的收藏`. A successful removal immediately removes it and updates the same voice in every category.

## Architecture And Data Flow

The page owns favorite API calls and canonical favorite IDs. The existing `voiceList` component remains presentational: it derives the current category, renders stars, and emits a favorite-toggle event containing the voice ID.

The page loads `/user/voices/favorites/list` independently from the regular category list. It builds a view model with a synthetic favorites category and decorates every voice with `isFavorite` and `favoritePending`. Favorite list responses are treated as voice objects; their IDs are also used to decorate copies of voices in regular categories.

Adding and removing use `/user/voices/favorite` with JSON body `{ id }` and `POST` or `DELETE`. On business success, the page updates its favorite collection and rebuilds the component view model. On HTTP or business failure, the page retains the previous state and displays a toast.

## Failure Handling

If the initial favorites request fails, the regular categories remain usable. `我的收藏` is empty, all stars are shown as non-favorite for that load, and the page displays `收藏列表加载失败`.

If a toggle request fails, the previous star and favorites list remain unchanged. Pending state is always cleared so the user can retry.

## Testing

Automated page and component tests cover:

- favorite list loading and synthetic category ordering;
- authenticated endpoint methods and `{ id }` request bodies;
- unchanged UI state while a request is pending;
- successful add and remove synchronization;
- failure rollback behavior and duplicate-click protection;
- star markup, colors, and event wiring.

