// Runs the electron vendor download (its lifecycle script may be skipped by
// package managers that block postinstalls until trusted).
require("../node_modules/electron/install.js");
