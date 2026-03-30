import { createDesktopPreviewBootstrap } from "@submind/desktop";

const { repository: _repository, ...bootstrap } = createDesktopPreviewBootstrap();

console.log(JSON.stringify(bootstrap, null, 2));
