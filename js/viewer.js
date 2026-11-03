// Manual viewer. Opens at the target page and scrolls on through the rest of the document, so a checklist
// that runs over the page break just continues. One tall box holds every page's slot; only the pages near
// the screen are drawn, which keeps memory low on an iPad.

import { openDoc, resolveRef } from "./pdfdocs.js";
import { plainNode } from "./plain.js";

const $ = function (s) {
	return document.querySelector(s);
};
const GAP = 10;
const PAD = 10;
const MAX_PIXELS = 12e6; // per canvas, well under the iOS limit
const MAX_FIT_WIDTH = 940; // the manuals are small-format pages; wider than this only enlarges the text
let S = null; // the open document's state

function msg(text) {
	const p = document.createElement("p");
	p.className = "v-msg";
	p.textContent = text;
	return p;
}

function teardown() {
	if (!S) return;
	S.body.removeEventListener("scroll", onScroll);
	S.divs.forEach(function (div) {
		if (div._task) {
			try {
				div._task.cancel();
			} catch (e) {
				/* done */
			}
		}
	});
	S = null;
}

export async function showRef(id, ref, label) {
	const viewer = $("#viewer");
	viewer.hidden = false;
	const note = $("#vNote");
	note.className = "";
	note.textContent = "Opening…";
	$("#vDoc").textContent = id + " · " + (label || ref.title);
	teardown();
	const pl = $("#vPlain");
	pl.replaceChildren();
	pl.hidden = !(id === "MEL" && ref.plain);
	if (!pl.hidden) pl.appendChild(plainNode(ref.plain, false));
	$("#vBody").replaceChildren(msg("Loading " + id + "…"));
	try {
		const r = await resolveRef(id, ref);
		const d = await openDoc(id);
		const first = await d.pdf.getPage(1);
		const base = first.getViewport({ scale: 1 });
		if (r.how === "bookmark") {
			note.textContent = 'Found by bookmark "' + ref.title + '"';
		} else {
			note.className = "warn";
			note.textContent =
				"Bookmark not found. Showing page " + r.page + " from the last check";
		}
		build(d.pdf, base, r.n, r.page);
	} catch (e) {
		$("#vBody").replaceChildren(
			msg(
				"Could not open this file as a PDF. " +
					(e && e.message ? e.message : ""),
			),
		);
	}
}

function build(pdf, base, n, page) {
	const body = $("#vBody");
	const wrap = document.createElement("div");
	wrap.className = "v-pages";
	body.replaceChildren(wrap);
	S = {
		pdf: pdf,
		base: base,
		n: n,
		body: body,
		wrap: wrap,
		scale: 0,
		auto: true,
		cur: page,
		divs: new Map(),
	};
	layout();
	body.addEventListener("scroll", onScroll, { passive: true });
	scrollToPage(page);
	update();
	$("#vOf").textContent = "/ " + n;
}

// Sizes the tall box for the current zoom. Page i sits at PAD + (i - 1) * pitch.
function layout() {
	const avail = Math.min(
		MAX_FIT_WIDTH,
		Math.max(260, S.body.clientWidth - 2 * PAD),
	);
	S.fit = avail / S.base.width;
	if (S.auto) S.scale = S.fit;
	S.pw = S.base.width * S.scale;
	S.ph = S.base.height * S.scale;
	S.pitch = S.ph + GAP;
	S.wrap.style.width = S.pw + 2 * PAD + "px";
	S.wrap.style.height = S.n * S.pitch - GAP + 2 * PAD + "px";
}

function scrollToPage(p) {
	S.cur = Math.max(1, Math.min(S.n, p));
	S.body.scrollTop = Math.max(0, PAD + (S.cur - 1) * S.pitch - 4);
}

let raf = 0;
function onScroll() {
	if (raf) return;
	raf = requestAnimationFrame(function () {
		raf = 0;
		if (S) update();
	});
}

// Draw the pages within one screen either side of the view and drop the rest.
function update() {
	const top = S.body.scrollTop;
	const h = S.body.clientHeight;
	let lo = Math.max(1, Math.floor((top - h - PAD) / S.pitch) + 1);
	let hi = Math.min(S.n, Math.ceil((top + 2 * h - PAD) / S.pitch));
	if (hi - lo > 11) hi = lo + 11;
	Array.from(S.divs.keys()).forEach(function (i) {
		if (i < lo || i > hi) removePage(i);
	});
	for (let i = lo; i <= hi; i++) if (!S.divs.has(i)) addPage(i);
	S.cur = Math.max(
		1,
		Math.min(S.n, Math.floor((top + h * 0.35 - PAD) / S.pitch) + 1),
	);
	const input = $("#vPage");
	if (document.activeElement !== input) input.value = S.cur;
}

function addPage(i) {
	const div = document.createElement("div");
	div.className = "v-page-box";
	div.style.top = PAD + (i - 1) * S.pitch + "px";
	div.style.left = PAD + "px";
	div.style.width = S.pw + "px";
	div.style.height = S.ph + "px";
	div._scale = S.scale;
	S.wrap.appendChild(div);
	S.divs.set(i, div);
	paint(i, div);
}

function removePage(i) {
	const div = S.divs.get(i);
	if (!div) return;
	if (div._task) {
		try {
			div._task.cancel();
		} catch (e) {
			/* done */
		}
	}
	div.remove();
	S.divs.delete(i);
}

async function paint(i, div) {
	const state = S;
	try {
		const page = await state.pdf.getPage(i);
		if (S !== state || state.divs.get(i) !== div) return;
		let dpr = Math.min(window.devicePixelRatio || 1, 2);
		while (dpr > 1 && state.pw * state.ph * dpr * dpr > MAX_PIXELS) dpr -= 0.25;
		const vp = page.getViewport({ scale: div._scale * dpr });
		const cv = document.createElement("canvas");
		cv.width = Math.floor(vp.width);
		cv.height = Math.floor(vp.height);
		cv.style.width = "100%";
		cv.style.height = "100%";
		div._task = page.render({
			canvasContext: cv.getContext("2d"),
			viewport: vp,
		});
		await div._task.promise;
		if (S !== state || state.divs.get(i) !== div) return;
		div.appendChild(cv);
	} catch (e) {
		/* cancelled while scrolling past */
	}
}

function setZoom(factor) {
	if (!S) return;
	const page = S.cur;
	S.auto = false;
	S.scale = Math.max(0.3, Math.min(5, S.scale * factor));
	Array.from(S.divs.keys()).forEach(removePage);
	layout();
	scrollToPage(page);
	update();
}

function close() {
	$("#viewer").hidden = true;
	$("#vPlain").replaceChildren();
	teardown();
	$("#vBody").replaceChildren();
}

$("#vClose").onclick = close;
$("#vPrev").onclick = function () {
	if (S) {
		scrollToPage(S.cur - 1);
		update();
	}
};
$("#vNext").onclick = function () {
	if (S) {
		scrollToPage(S.cur + 1);
		update();
	}
};
$("#vIn").onclick = function () {
	setZoom(1.25);
};
$("#vOut").onclick = function () {
	setZoom(0.8);
};
$("#vPage").onchange = function (e) {
	if (!S) return;
	const p = parseInt(e.target.value, 10);
	if (p) {
		scrollToPage(p);
		update();
	}
	e.target.blur();
};
document.addEventListener("keydown", function (e) {
	if (e.key === "Escape" && !$("#viewer").hidden) close();
});
let resizeTimer = 0;
window.addEventListener("resize", function () {
	if (!S) return;
	clearTimeout(resizeTimer);
	resizeTimer = setTimeout(function () {
		if (!S) return;
		const page = S.cur;
		Array.from(S.divs.keys()).forEach(removePage);
		layout();
		scrollToPage(page);
		update();
	}, 150);
});
