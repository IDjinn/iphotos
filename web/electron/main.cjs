const { app, BrowserWindow, Menu, shell } = require("electron");
const http = require("node:http");
const path = require("node:path");

// Fixed port so the backend CORS config can list this origin (docs/plans/14 §2).
const EMBEDDED_PORT = 3210;

const isDev = !app.isPackaged;

function buildMenu() {
  const template = [
    {
      label: "Navigation",
      submenu: [
        {
          label: "Back",
          accelerator: "Alt+Left",
          click: (_item, window) => window?.webContents?.goBack(),
        },
        {
          label: "Forward",
          accelerator: "Alt+Right",
          click: (_item, window) => window?.webContents?.goForward(),
        },
        { type: "separator" },
        { role: "reload" },
        { role: "forceReload" },
        { role: "toggleDevTools" },
        { type: "separator" },
        { role: "close" },
      ],
    },
    { role: "editMenu" },
    { role: "viewMenu" },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

function startEmbeddedServer(port) {
  return new Promise((resolve, reject) => {
    const next = require("next");
    const nextApp = next({ dev: false, dir: app.getAppPath() });
    nextApp
      .prepare()
      .then(() => {
        const handle = nextApp.getRequestHandler();
        const server = http.createServer((req, res) => handle(req, res));
        server.once("error", reject);
        server.listen(port, "127.0.0.1", () => resolve(server));
      })
      .catch(reject);
  });
}

async function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 940,
    minHeight: 600,
    backgroundColor: "#09090b",
    show: false,
    autoHideMenuBar: false,
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  win.once("ready-to-show", () => win.show());

  // Mouse side buttons (browser-backward/forward) navigate history.
  win.on("app-command", (_event, command) => {
    if (command === "browser-backward") win.webContents.goBack();
    else if (command === "browser-forward") win.webContents.goForward();
  });

  win.webContents.setWindowOpenHandler(({ url }) => {
    // External links leave the app shell to the system browser.
    if (url.startsWith("http://localhost:3000") || url.startsWith(`http://127.0.0.1:${EMBEDDED_PORT}`)) {
      return { action: "allow" };
    }
    void shell.openExternal(url);
    return { action: "deny" };
  });

  if (isDev) {
    await win.loadURL("http://localhost:3000");
  } else {
    await startEmbeddedServer(EMBEDDED_PORT);
    await win.loadURL(`http://127.0.0.1:${EMBEDDED_PORT}`);
  }
}

app.whenReady().then(() => {
  buildMenu();
  createWindow().catch((error) => {
    console.error("[electron] failed to start:", error);
    app.quit();
  });

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) void createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
