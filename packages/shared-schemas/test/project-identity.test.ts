import { describe, expect, it } from "vitest";

import {
  createProjectGroupingKey,
  createProjectIdFromWorkspacePath,
  getWorkspaceBaseName,
  normalizeWorkspacePath
} from "../src/index";

describe("project identity", () => {
  it("normalizes workspace paths across Windows, file URIs, and WSL mount paths", () => {
    expect(
      normalizeWorkspacePath("C:\\Users\\xtrem\\OneDrive\\Documents\\codecraft\\SubMind\\")
    ).toBe("C:/Users/xtrem/OneDrive/Documents/codecraft/SubMind");
    expect(
      normalizeWorkspacePath("file:///c:/Users/xtrem/OneDrive/Documents/codecraft/SubMind")
    ).toBe("C:/Users/xtrem/OneDrive/Documents/codecraft/SubMind");
    expect(
      normalizeWorkspacePath("/mnt/c/Users/xtrem/OneDrive/Documents/codecraft/SubMind")
    ).toBe("C:/Users/xtrem/OneDrive/Documents/codecraft/SubMind");
    expect(
      normalizeWorkspacePath(
        "vscode-remote://wsl%2Bubuntu/mnt/c/Users/xtrem/OneDrive/Documents/codecraft/SubMind"
      )
    ).toBe("C:/Users/xtrem/OneDrive/Documents/codecraft/SubMind");
    expect(
      normalizeWorkspacePath(
        "\\\\wsl.localhost\\Ubuntu\\mnt\\c\\Users\\xtrem\\OneDrive\\Documents\\codecraft\\SubMind"
      )
    ).toBe("C:/Users/xtrem/OneDrive/Documents/codecraft/SubMind");
    expect(normalizeWorkspacePath("/home/xtrem/codecraft/SubMind")).toBe(
      "/home/xtrem/codecraft/SubMind"
    );
    expect(
      normalizeWorkspacePath("file:///home/xtrem/codecraft/SubMind")
    ).toBe("/home/xtrem/codecraft/SubMind");
    expect(
      normalizeWorkspacePath(
        "vscode-remote://ssh-remote%2Bbuildbox/home/xtrem/codecraft/SubMind"
      )
    ).toBe("//vscode-remote/ssh-remote+buildbox/home/xtrem/codecraft/SubMind");
  });

  it("keeps non-WSL remote authorities distinct until an explicit alias links them", () => {
    const localPath = "/home/xtrem/codecraft/SubMind";
    const buildBoxPath =
      "vscode-remote://ssh-remote%2Bbuildbox/home/xtrem/codecraft/SubMind";
    const stagingPath =
      "vscode-remote://ssh-remote%2Bstaging/home/xtrem/codecraft/SubMind";

    expect(createProjectGroupingKey(buildBoxPath)).not.toBe(
      createProjectGroupingKey(localPath)
    );
    expect(createProjectGroupingKey(buildBoxPath)).not.toBe(
      createProjectGroupingKey(stagingPath)
    );
  });

  it("creates the same grouping key and project id for equivalent workspace locators", () => {
    const windowsPath = "C:/Users/xtrem/OneDrive/Documents/codecraft/SubMind";
    const wslRemotePath =
      "vscode-remote://wsl%2Bubuntu/mnt/c/Users/xtrem/OneDrive/Documents/codecraft/SubMind";

    expect(createProjectGroupingKey(windowsPath)).toBe(
      createProjectGroupingKey(wslRemotePath)
    );
    expect(createProjectIdFromWorkspacePath(windowsPath)).toBe(
      createProjectIdFromWorkspacePath(wslRemotePath)
    );
    expect(getWorkspaceBaseName(wslRemotePath)).toBe("SubMind");
  });

  it("groups WSL UNC and native Linux workspace locators when they target the same WSL path", () => {
    const nativeWslPath = "/home/xtrem/codecraft/SubMind";
    const wslUncPath = "\\\\wsl.localhost\\Ubuntu\\home\\xtrem\\codecraft\\SubMind";
    const legacyWslUncPath = "\\\\wsl$\\Ubuntu\\home\\xtrem\\codecraft\\SubMind";

    expect(createProjectGroupingKey(wslUncPath)).toBe(
      createProjectGroupingKey(nativeWslPath)
    );
    expect(createProjectGroupingKey(legacyWslUncPath)).toBe(
      createProjectGroupingKey(nativeWslPath)
    );
    expect(createProjectIdFromWorkspacePath(wslUncPath)).toBe(
      createProjectIdFromWorkspacePath(nativeWslPath)
    );
  });
});
