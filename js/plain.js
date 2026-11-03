// Plain-English breakdown of a MEL item, shown on the light's MEL card and above the manual page.
// `plain` comes from data/lights.json: { lead, meta?, conditions?, limits?, crew?, notes? }.

function el(tag, cls, text) {
	const n = document.createElement(tag);
	if (cls) n.className = cls;
	if (text) n.textContent = text;
	return n;
}

function list(title, items) {
	const box = el("div", "pl-sec");
	box.appendChild(el("h4", "", title));
	const ul = el("ul");
	items.forEach(function (t) {
		ul.appendChild(el("li", "", t));
	});
	box.appendChild(ul);
	return box;
}

// Returns a <details> element. `open` starts it expanded.
export function plainNode(plain, open) {
	const d = el("details", "plain");
	d.open = !!open;
	const s = el("summary");
	s.appendChild(el("span", "pl-tag", "Plain English"));
	s.appendChild(el("span", "pl-lead", plain.lead));
	d.appendChild(s);
	const body = el("div", "pl-body");
	if (plain.meta) body.appendChild(el("p", "pl-meta", plain.meta));
	if (plain.conditions && plain.conditions.length)
		body.appendChild(list("Conditions", plain.conditions));
	if (plain.limits && plain.limits.length)
		body.appendChild(list("Limitations", plain.limits));
	if (plain.crew && plain.crew.length)
		body.appendChild(list("Crew actions", plain.crew));
	if (plain.notes && plain.notes.length)
		body.appendChild(list("Notes", plain.notes));
	body.appendChild(
		el("p", "pl-foot", "A summary of the item. The page is the authority."),
	);
	d.appendChild(body);
	return d;
}
