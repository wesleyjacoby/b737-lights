// 737 Light Reference. Home shows the systems; a system shows its panel; a light shows its detail.

import {
	DOCS,
	files,
	initStore,
	saveFile,
	loadDataRecord,
	saveDataRecord,
} from "./store.js";
import { forget } from "./pdfdocs.js";
import { showRef } from "./viewer.js";
import { canAnimate, expand, collapse, crossfade, fadeSwap } from "./motion.js";
import { plainNode } from "./plain.js";

const $ = function (s) {
	return document.querySelector(s);
};
const DISPATCH = {
	go: "May be inop",
	conditional: "Conditional",
	nogo: "No-go",
	none: "No item",
};

let DATA = null;
let route = { sys: null, light: null };
let query = "";
let shownMode = "home"; // what is on screen: 'home' | 'system' | 'search'
let busy = false; // a transition is running
let stale = false; // state changed during a transition, so redraw when it ends
let lastDetail = null; // the light whose detail is on screen
let pending = null; // a link waiting for its PDF to be chosen
let pickFor = null; // the manual chosen from the drawer, or 'DATA' for the light data
let dataInfo = null; // where the light data came from: { src, name, size, built, error }

function el(tag, attrs, kids) {
	const n = document.createElement(tag);
	Object.keys(attrs || {}).forEach(function (k) {
		const v = attrs[k];
		if (k === "class") n.className = v;
		else if (k === "text") n.textContent = v;
		else if (k.slice(0, 2) === "on") n.addEventListener(k.slice(2), v);
		else if (v !== false && v != null) n.setAttribute(k, v);
	});
	(kids || []).forEach(function (c) {
		if (c)
			n.appendChild(typeof c === "string" ? document.createTextNode(c) : c);
	});
	return n;
}

function mode() {
	return query.trim() ? "search" : route.sys ? "system" : "home";
}
function systemById(id) {
	return DATA.systems.find(function (s) {
		return s.id === id;
	});
}

/* ---------- routing: #system or #system/light ---------- */

function readHash() {
	const parts = (location.hash || "").replace("#", "").split("/");
	const sys = systemById(parts[0]) ? parts[0] : null;
	route = {
		sys: sys,
		light: sys && parts[1] && DATA.lights[parts[1]] ? parts[1] : null,
	};
}

function writeHash(prev) {
	const url = route.sys
		? "#" + route.sys + (route.light ? "/" + route.light : "")
		: location.pathname + location.search;
	try {
		if (prev.light && route.light) history.replaceState(null, "", url);
		else history.pushState(null, "", url);
	} catch (e) {
		/* the hash is a convenience */
	}
}

// Move to a system and/or light. `tile` is the system tile that was pressed, if any.
function navigate(sys, light, tile) {
	const prev = { sys: route.sys, light: route.light };
	const prevMode = mode();
	if (query) {
		query = "";
		$("#q").value = "";
	}
	if (prev.sys === sys && prev.light === light && prevMode === mode()) return;
	route = { sys: sys, light: light };
	if (prev.sys !== sys || prev.light !== light) writeHash(prev);
	transition(tile, prev.sys);
}

/* ---------- drawing ---------- */

function lightCount(sys) {
	let n = 0;
	sys.sections.forEach(function (sec) {
		sec.lights.forEach(function (id) {
			n += DATA.lights[id].chips.length;
		});
	});
	return n;
}

let firstHome = true;
function renderHome() {
	const grid = $("#sysGrid");
	grid.replaceChildren();
	DATA.systems.forEach(function (s, i) {
		const n = lightCount(s);
		const b = el(
			"button",
			{
				class: "sys",
				type: "button",
				"data-sys": s.id,
				disabled: n ? false : "disabled",
				onclick: function (e) {
					navigate(s.id, null, e.currentTarget);
				},
			},
			[
				el("b", { text: s.code }),
				el("span", { text: s.name }),
				el("small", {
					text: n ? n + (n === 1 ? " light" : " lights") : "Not added yet",
				}),
			],
		);
		if (firstHome) b.style.setProperty("--i", i);
		grid.appendChild(b);
	});
	if (firstHome) {
		grid.classList.add("intro");
		setTimeout(function () {
			grid.classList.remove("intro");
		}, 1200);
		firstHome = false;
	}
}

function renderChips() {
	const nav = $("#chips");
	nav.replaceChildren();
	DATA.systems.forEach(function (s) {
		nav.appendChild(
			el("button", {
				class: "chip",
				type: "button",
				text: s.code,
				disabled: lightCount(s) ? false : "disabled",
				"aria-current": String(mode() === "system" && route.sys === s.id),
				onclick: function () {
					navigate(s.id, null);
				},
			}),
		);
	});
	const current = nav.querySelector('[aria-current="true"]');
	if (current)
		nav.scrollLeft = Math.max(
			0,
			current.offsetLeft - nav.clientWidth / 2 + current.offsetWidth / 2,
		);
}

function tileFor(sysId, lightId, chip) {
	const l = DATA.lights[lightId];
	return el(
		"button",
		{
			class: "tile",
			type: "button",
			"aria-pressed": String(route.light === lightId),
			"aria-label": l.name + ", " + chip.sub,
			onclick: function () {
				navigate(sysId, lightId);
			},
		},
		[el("b", { text: chip.top }), el("i", { text: chip.sub })],
	);
}

function renderPanel(sys) {
	const list = $("#list");
	list.replaceChildren();
	sys.sections.forEach(function (sec) {
		const tiles = el("div", { class: "tiles" });
		sec.lights.forEach(function (id) {
			DATA.lights[id].chips.forEach(function (c) {
				tiles.appendChild(tileFor(sys.id, id, c));
			});
		});
		list.appendChild(
			el("section", { class: "plate" }, [
				el("h2", {}, [sec.name, el("span", { text: sec.ref })]),
				tiles,
			]),
		);
	});
}

function lightText(l) {
	return [
		l.name,
		l.why,
		l.chips
			.map(function (c) {
				return c.top + " " + c.sub;
			})
			.join(" "),
	]
		.join(" ")
		.toLowerCase();
}

function renderSearch() {
	const q = query.trim().toLowerCase();
	const list = $("#list");
	list.replaceChildren();
	let shown = 0;
	DATA.systems.forEach(function (sys) {
		const tiles = el("div", { class: "tiles" });
		sys.sections.forEach(function (sec) {
			sec.lights.forEach(function (id) {
				if (lightText(DATA.lights[id]).indexOf(q) < 0) return;
				DATA.lights[id].chips.forEach(function (c) {
					tiles.appendChild(tileFor(sys.id, id, c));
					shown++;
				});
			});
		});
		if (tiles.children.length)
			list.appendChild(
				el("section", { class: "plate" }, [
					el("h2", {}, [sys.name, el("span", { text: sys.code })]),
					tiles,
				]),
			);
	});
	if (!shown)
		list.appendChild(
			el("p", {
				class: "empty",
				text:
					'No light matches "' +
					query.trim() +
					'". Only some systems are added so far.',
			}),
		);
}

function refButton(id, ref, text, label) {
	return el("button", {
		class: "link",
		type: "button",
		text: text,
		onclick: function () {
			openLink(id, ref, label);
		},
	});
}

function renderDetail() {
	const d = $("#detail");
	const fresh = route.light !== lastDetail;
	lastDetail = route.light;
	d.classList.toggle("enter", fresh && canAnimate());
	d.replaceChildren();
	if (!route.light) {
		d.classList.remove("open");
		d.appendChild(
			el("p", {
				class: "hint",
				text: "Pick a light. You get what it means, what the QRH says, what the MEL allows, and a short note on the system, each with a link into your own copy of the manual.",
			}),
		);
		return;
	}
	const l = DATA.lights[route.light];
	d.classList.add("open");
	d.appendChild(
		el("button", {
			class: "btn back",
			type: "button",
			text: "‹ Back",
			onclick: function () {
				navigate(route.sys, null);
			},
		}),
	);
	d.appendChild(
		el("div", { class: "d-head" }, [
			el("h2", { text: l.name }),
			el("span", {
				class: "badge",
				text: l.memory ? "Memory items" : "No memory items",
			}),
		]),
	);
	d.appendChild(
		el("div", { class: "sec" }, [
			el("h3", { text: "Why it is on" }),
			el("p", { text: l.why }),
		]),
	);

	const q = el("div", { class: "sec" }, [el("h3", { text: "QRH" })]);
	l.qrh.forEach(function (e) {
		q.appendChild(
			el("div", { class: "entry" }, [
				e.when ? el("p", { class: "when", text: e.when }) : null,
				el("p", { class: "ttl", text: e.title }),
				el("p", { class: "gist", text: e.gist }),
				el("div", { class: "row" }, [
					refButton("QRH", e, "Open checklist " + e.printed, e.title),
					el("span", {
						class: "rev",
						text: "page " + e.printed + (e.rev ? " · " + e.rev : ""),
					}),
				]),
			]),
		);
	});
	d.appendChild(q);

	const m = el("div", { class: "sec" }, [el("h3", { text: "MEL" })]);
	l.mel.forEach(function (e) {
		m.appendChild(
			el("div", { class: "entry" }, [
				el("div", { class: "row" }, [
					el("span", {
						class: "pill " + e.dispatch,
						text: DISPATCH[e.dispatch],
					}),
					el("b", { text: e.exact ? e.item : "Nearest section: " + e.item }),
				]),
				e.exact ? el("p", { class: "ttl", text: e.title }) : null,
				el("p", { class: "gist", text: e.gist }),
				e.plain ? plainNode(e.plain, false) : null,
				el("div", { class: "row" }, [
					refButton(
						"MEL",
						e,
						e.exact ? "Open " + e.item : "Open start of " + e.item,
						e.title,
					),
					el("span", { class: "rev", text: e.rev || "" }),
				]),
			]),
		);
	});
	d.appendChild(m);

	const f = el("div", { class: "sec" }, [el("h3", { text: "FCOM" })]);
	l.fcom.forEach(function (e) {
		f.appendChild(
			el("div", { class: "entry" }, [
				el("p", { class: "ttl", text: e.label }),
				el("p", { class: "gist", text: e.gist }),
				el("div", { class: "row" }, [
					refButton("FCOM", e, "Open FCOM page", e.label),
					el("span", { class: "rev", text: e.rev || "" }),
				]),
			]),
		);
	});
	d.appendChild(f);

	d.appendChild(
		el("div", { class: "sec" }, [
			el("h3", { text: "The system behind it" }),
			el("p", { text: l.system }),
		]),
	);

	if (l.review && l.review.length) {
		const v = el("ul", { class: "verify" });
		l.review.forEach(function (r) {
			v.appendChild(el("li", { text: r }));
		});
		d.appendChild(
			el("div", { class: "sec" }, [el("h3", { text: "To verify" }), v]),
		);
	}
	d.scrollTop = 0;
}

// Fills the panel for the current system or the search results.
function renderWork() {
	const title = $("#stageTitle");
	const sys = route.sys ? systemById(route.sys) : null;
	if (mode() === "search") {
		title.children[0].textContent = "";
		title.children[1].textContent = "Search results";
		renderSearch();
	} else if (sys) {
		title.children[0].textContent = sys.code;
		title.children[1].textContent = sys.name;
		renderPanel(sys);
	}
	renderChips();
	renderDetail();
}

// Instant draw of whatever the state says.
function render() {
	const m = mode();
	$("#home").hidden = m !== "home";
	$("#work").hidden = m === "home";
	if (m === "home") renderHome();
	else renderWork();
	shownMode = m;
}

/* ---------- moving between views, with animation ---------- */

async function transition(tile, prevSys) {
	const next = mode();
	const prev = shownMode;
	if (busy) {
		stale = true;
		return;
	}
	if (!canAnimate() || (prev === next && next !== "system")) {
		render();
		return;
	}
	busy = true;
	try {
		if (prev === "home" && next === "system" && tile) {
			await expand(tile, renderWork);
		} else if (prev === "system" && next === "home") {
			await collapse(prevSys, renderHome);
		} else if (prev === "home" && next !== "home") {
			await fadeSwap($("#home"), $("#work"), renderWork);
		} else if (prev !== "home" && next === "home") {
			await fadeSwap($("#work"), $("#home"), renderHome);
		} else if (prev !== next || route.sys !== prevSys) {
			await crossfade(renderWork);
		} else {
			render();
		}
	} finally {
		busy = false;
		shownMode = next;
		if (stale) {
			stale = false;
			render();
		} else if (next !== "home") renderDetail();
	}
}

/* ---------- manuals ---------- */

function renderDocs() {
	const box = $("#docs");
	box.replaceChildren();
	DOCS.forEach(function (d) {
		const f = files[d.id];
		let state = "Not loaded";
		if (f)
			state =
				f.name +
				" (" +
				(f.size / 1048576).toFixed(1) +
				" MB)" +
				(f.saved ? "" : ", this session only");
		box.appendChild(
			el("div", { class: "doc" }, [
				el("h3", { text: d.name }),
				el("p", { text: d.full }),
				el("p", { class: "state", text: state }),
				el("button", {
					class: "btn" + (f ? "" : " primary"),
					type: "button",
					text: f ? "Replace file" : "Choose PDF",
					onclick: function () {
						pending = null;
						pickFor = d.id;
						$("#picker").value = "";
						$("#picker").click();
					},
				}),
			]),
		);
	});
	let dstate = "Not loaded";
	if (dataInfo && dataInfo.src === "server")
		dstate = "data/lights.json from the server";
	else if (dataInfo && dataInfo.src === "device")
		dstate =
			dataInfo.name +
			" (" +
			(dataInfo.size / 1024).toFixed(0) +
			" KB)" +
			(DATA && DATA.meta && DATA.meta.built
				? ", built " + DATA.meta.built
				: "");
	box.appendChild(
		el("div", { class: "doc" }, [
			el("h3", { text: "Light data" }),
			el("p", { text: "lights.json, kept off GitHub" }),
			el("p", { class: "state", text: dstate }),
			dataInfo && dataInfo.error
				? el("p", { class: "state warn", text: dataInfo.error })
				: null,
			el("button", {
				class: "btn" + (DATA ? "" : " primary"),
				type: "button",
				text: DATA ? "Replace file" : "Choose lights.json",
				onclick: pickData,
			}),
		]),
	);
	box.appendChild(
		el("p", {
			class: "docs-note",
			text: "Your PDFs stay on this device. Nothing is uploaded. Each link finds its checklist or MEL item by bookmark title, so links keep working after a revision as long as the title does not change.",
		}),
	);
}

function pickData() {
	pending = null;
	pickFor = "DATA";
	$("#picker").accept = ".json,application/json";
	$("#picker").value = "";
	$("#picker").click();
}

function checkData(obj) {
	return (
		obj &&
		Array.isArray(obj.systems) &&
		obj.lights &&
		typeof obj.lights === "object"
	);
}

// Shown on the home screen until the light data has been loaded.
function renderSetup() {
	$("#sysGrid").replaceChildren();
	$("#homeCrumb").textContent = "Light data needed";
	const old = $("#home").querySelector(".setup");
	if (old) old.remove();
	$("#home").appendChild(
		el("div", { class: "setup" }, [
			el("h2", { text: "Load your light data" }),
			el("p", {
				text: "The light data is not stored on GitHub. Choose lights.json once and it stays on this device. It works offline after that.",
			}),
			el("button", {
				class: "btn primary",
				type: "button",
				text: "Choose lights.json",
				onclick: pickData,
			}),
		]),
	);
}

function openLink(id, ref, label) {
	if (files[id]) {
		showRef(id, ref, label);
		return;
	}
	pending = { id: id, ref: ref, label: label };
	$("#picker").value = "";
	$("#picker").click();
}

async function onPickedData(f) {
	try {
		const text = await f.text();
		const obj = JSON.parse(text);
		if (!checkData(obj)) throw new Error("not a light data file");
		await saveDataRecord(f.name, f.size, text);
		DATA = obj;
		dataInfo = { src: "device", name: f.name, size: f.size };
		const setup = $("#home").querySelector(".setup");
		if (setup) setup.remove();
		$("#homeCrumb").textContent = "Systems";
		firstHome = true;
		lastDetail = null;
		readHash();
		render();
	} catch (err) {
		dataInfo = Object.assign({}, dataInfo || {}, {
			error: "That file could not be read as light data.",
		});
	}
	renderDocs();
}

async function onPicked(e) {
	const f = e.target.files && e.target.files[0];
	$("#picker").accept = "application/pdf,.pdf";
	if (f && pickFor === "DATA") {
		pickFor = null;
		await onPickedData(f);
		return;
	}
	const id = pending ? pending.id : pickFor;
	if (!f || !id) {
		pending = null;
		return;
	}
	forget(id);
	await saveFile(id, f);
	renderDocs();
	if (pending && pending.id === id) {
		const p = pending;
		pending = null;
		showRef(p.id, p.ref, p.label);
	}
}

/* ---------- start ---------- */

async function loadData() {
	// A local server may have data/lights.json (handy while developing). On GitHub Pages it is not there.
	try {
		const r = await fetch("data/lights.json");
		if (r.ok) {
			const obj = await r.json();
			if (checkData(obj)) {
				dataInfo = { src: "server" };
				return obj;
			}
		}
	} catch (e) {
		/* not on the server, or offline */
	}
	const rec = await loadDataRecord();
	if (rec) {
		try {
			const obj = JSON.parse(rec.text);
			if (checkData(obj)) {
				dataInfo = { src: "device", name: rec.name, size: rec.size };
				return obj;
			}
		} catch (e) {
			/* damaged copy, ask again */
		}
	}
	return null;
}

async function start() {
	await initStore();
	DATA = await loadData();
	renderDocs();
	if (DATA) {
		readHash();
		render();
	} else renderSetup();

	$("#brand").onclick = function () {
		if (DATA) navigate(null, null);
	};
	$("#backSys").onclick = function () {
		navigate(null, null);
	};
	$("#q").addEventListener("input", function (e) {
		if (!DATA) return;
		query = e.target.value;
		transition(null, route.sys);
	});
	$("#docsBtn").onclick = function () {
		const box = $("#docs");
		const open = box.hidden;
		box.hidden = !open;
		this.setAttribute("aria-expanded", String(open));
	};
	$("#chips").addEventListener(
		"wheel",
		function (e) {
			// a mouse wheel scrolls the row sideways; trackpads and touch already do
			if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) {
				this.scrollLeft += e.deltaY;
				e.preventDefault();
			}
		},
		{ passive: false },
	);
	$("#picker").addEventListener("change", onPicked);
	window.addEventListener("popstate", function () {
		if (!DATA) return;
		const prevSys = route.sys;
		readHash();
		transition(null, prevSys);
	});

	if ("serviceWorker" in navigator)
		navigator.serviceWorker.register("sw.js").catch(function () {
			/* offline use is optional */
		});
	window.__ready = true;
}

start();
