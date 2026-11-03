"""Dump the bookmark tree of each manual to JSON: [{depth,title,page}]. Usage: dump_outlines.py <pdf> <out.json>"""
import sys, json, pypdf
r = pypdf.PdfReader(sys.argv[1])
out = []
def walk(o, d):
    for i in o:
        if isinstance(i, list):
            walk(i, d + 1)
        else:
            try: p = r.get_destination_page_number(i) + 1
            except Exception: p = None
            out.append({"depth": d, "title": i.title, "page": p})
walk(r.outline, 0)
json.dump(out, open(sys.argv[2], "w"), indent=0)
print(sys.argv[1], len(out))
