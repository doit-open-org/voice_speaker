# Common Templates Page Design

## Goal

Add a `常用模板` page opened from the home text tools. The page provides categorized advertising copy that can be returned to the home textarea and generic audio that can be previewed or opened in the existing generate workflow.

## Page Structure

Create `pages/commonTemplate/commonTemplate` and register it in `app.json`. Use a native page navigation bar with a white background and two top tabs: `广告模板` and `通用语音`. The advertising tab is selected initially.

The advertising tab has a fixed left directory and a scrollable item pane. The first two directory entries are `添加模版` and `我的模版`; they show a `暂无内容` state because no backing APIs were supplied. Remaining entries are unique `category` values from the advertising template response, preserving server order. The first API category is selected initially.

The generic voice tab is a full-width list with one row per audio item: play or pause on the left, name in the center, and a `发送` button on the right.

## Data Sources

Reuse `utils/request.js`, whose current `BASE_URL` points at the supplied LAN server.

- Advertising templates: `GET /ad-templates/` with `page_size: 100`, no authentication.
- Generic voices: `GET /generic-voices` with `page_size: 100`, no authentication. Load this endpoint the first time the generic tab is selected.

Both APIs return paginated data arrays. If a response reports more than one page, load the remaining pages and combine them in page order. Loading and error states are independent per tab. The current LAN server returns database errors because `ad_templates` and `generic_voices` tables are missing; the page must remain usable and show an error empty state until the backend is ready.

## Advertising Template Interaction

Collapsed template rows have a consistent minimum height and clamp content to three lines. Each row has a down arrow; tapping it expands that row to show the complete content and changes the arrow to point up. Tapping again collapses it. Expansion state is independent per template.

The `使用` button emits `templateSelected` through the opener EventChannel with the exact `item.content`, then navigates back. The home page listens for this event and writes the content to `inputText`.

## Generic Voice Interaction

Create one `InnerAudioContext` for the page. Tapping play starts the selected `music_file`; tapping the active item pauses it; selecting another item replaces the source and plays the new audio. Pause, ended, and error callbacks clear the playing state. Hide pauses playback, and unload destroys the context.

Tapping `发送` stores the selected item in `app.globalData.generate`, mapping `music_file` to `audio_url` and deriving a usable `file_name` when none exists, then navigates to `pages/generate/generate`.

The generate page must accept both complete HTTP(S) URLs and scheme-less host paths. It keeps complete URLs unchanged and only prepends `https://` when no scheme exists.

## Testing

Automated tests cover page registration, home navigation and EventChannel content return, category derivation and synthetic entries, empty states, row expansion, request paths and pagination, audio switching and cleanup, send navigation/global state, generate URL normalization, and request failure handling.

