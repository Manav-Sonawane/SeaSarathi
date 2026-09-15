"""
test_imd_scrapers.py — Unit tests for the IMD scraper modules' PURE parsing
functions (no network calls — fixture strings only), matching this
project's existing plain-script test convention (see test_geofence.py,
test_apis.py) rather than introducing pytest as a new dependency.

Phase 7 of IMD_IMPLEMENTATION_PLAN.md, Task 7.3. Covers what's actually
deterministic and regression-prone in each phase:
  - Phase 1: hub-page region/PDF-link extraction (the jQuery-click-handler
    parsing that replaced the plan's "find all <a> tags" assumption).
  - Phase 2/4 (shared): bulletin header parsing across both the live-HTML
    line style ("TTT Warning" / "NIL" as separate lines) and the
    PDF-extracted combined-line style ("TTT Warning NIL" on one line).
  - Phase 3: warning-archive table parsing + the deterministic severity
    classifier.
  - Phase 5: port-warning table parsing + the IMD-signal-taxonomy classifier
    (including the "unrecognized code -> severity None, never guess" rule).

Run directly: python test_imd_scrapers.py
"""
import sys

_failures = 0
_checks = 0


def check(label: str, actual, expected):
    global _checks, _failures
    _checks += 1
    ok = actual == expected
    if not ok:
        _failures += 1
    status = "PASS" if ok else "FAIL"
    print(f"[{status}] {label}")
    if not ok:
        print(f"       expected: {expected!r}")
        print(f"       actual:   {actual!r}")


def section(title: str):
    print(f"\n=== {title} ===")


# ─── Phase 1: hub page region/PDF-link parsing ────────────────────────────

section("Phase 1 — parse_hub_page")
from src.services.imd_fisherman_scraper import parse_hub_page

_HUB_FIXTURE = """
<html><body>
<script>
jQuery('#a1').click(function() {
              var html = '<a target="_blank" href=../../backend/assets/acwc_kolkata_pdf/fishermen2.pdf download="Fishermen-Marine-Forecast.pdf" >Download PDF</a>';
              jQuery('#chartdiv').html(html);
          });
jQuery('#a7').click(function() {
              var html = '<a target="_blank" href=../../backend/assets/cwc_ahmedabad_pdf/FISHERMEN_WARNING.pdf download="Fishermen-Marine-Forecast.pdf" >Download PDF</a>';
              jQuery('#chartdiv').html(html);
          });
</script>
<ul>
<li><a href="#." id="a1">West Bengal Coast, Northwest Bay of Bengal</a></li>
<li><a href="#." id="a7" style="color:#472bc5">North Gujarat Coast, South Gujarat Coast</a></li>
</ul>
</body></html>
"""

regions = parse_hub_page(_HUB_FIXTURE)
check("finds both regions", len(regions), 2)
check("region order (a1 before a7)", [r["region_id"] for r in regions], ["a1", "a7"])
check("a1 label extracted", regions[0]["region_label"], "West Bengal Coast, Northwest Bay of Bengal")
check(
    "a1 relative pdf href resolved to absolute URL",
    regions[0]["pdf_url"],
    "https://mausam.imd.gov.in/backend/assets/acwc_kolkata_pdf/fishermen2.pdf",
)
check("a7 label uses the styled <a> variant", regions[1]["region_label"], "North Gujarat Coast, South Gujarat Coast")

# A region with a label but no matching JS click handler (or vice versa)
# must not appear — both halves have to be present to trust the pairing.
_PARTIAL_FIXTURE = '<a href="#." id="a3">Orphan Region With No PDF</a>'
check("label with no PDF handler yields zero regions", parse_hub_page(_PARTIAL_FIXTURE), [])


# ─── Phase 2/4 shared: bulletin header parsing ────────────────────────────

section("Phase 2/4 — imd_sea_bulletin_parser")
from src.services.imd_sea_bulletin_parser import clean_bulletin_lines, parse_bulletin_header

# Live-HTML style: label and value as separate lines (from BeautifulSoup's get_text()).
_HTML_STYLE_LINES = [
    "Sea Area Bulletin",
    "Bulletin Valid for 12 hrs from 14 UTC of 2026-09-15",
    "to 02 UTC of 2026-09-16",
    "TTT Warning",
    "NIL",
    "North West Arabian Sea",
    "Wind",
    "Westerly 15 to 20 Knots",
    "Part 4",
    "AAXX 01512 99942 339 junk code data here",
    "Part 6",
    "more junk 40050 539",
    "Time of Issue",
    "20:22 IST of 2026-09-15",
]
header = parse_bulletin_header(_HTML_STYLE_LINES)
check("HTML-style TTT warning (separate line)", header["ttt_warning"], "NIL")
check("HTML-style issue time (separate line)", header["issue_time_stated"], "20:22 IST of 2026-09-15")
check("validity valid_from_utc parsed", header["valid_from_utc"], "2026-09-15T14:00:00+00:00")
check("validity valid_until_utc parsed", header["valid_until_utc"], "2026-09-16T02:00:00+00:00")

cleaned = clean_bulletin_lines(_HTML_STYLE_LINES)
check("junk WMO code block stripped", any(l.startswith("AAXX") for l in cleaned), False)
check("content before junk block kept", "North West Arabian Sea" in cleaned, True)
check("Time of Issue line kept (after junk block)", "Time of Issue" in cleaned, True)

# PDF-extraction style: label and value combined on one line (pdfplumber
# sometimes merges what were two table cells into one line of text).
_PDF_STYLE_LINES = [
    "Bulletin Valid for 12 hrs from 08 UTC of 2026-09-15 to 20 UTC of 2026-09-15",
    "TTT Warning NIL",
    "North West Arabian Sea",
    "Part 4",
    "Part 5 NIL",
    "AAXX 01503 99942 339 more junk",
    "Time of Issue 14:09 IST of 2026-09-15",
]
header2 = parse_bulletin_header(_PDF_STYLE_LINES)
check("PDF-style TTT warning (combined line)", header2["ttt_warning"], "NIL")
check("PDF-style issue time (combined line)", header2["issue_time_stated"], "14:09 IST of 2026-09-15")

cleaned2 = clean_bulletin_lines(_PDF_STYLE_LINES)
check("PDF-style junk block stripped too", any(l.startswith("AAXX") for l in cleaned2), False)


# ─── Phase 3: warning-archive table parsing + severity ────────────────────

section("Phase 3 — imd_cyclone_warning_scraper")
from src.services.imd_cyclone_warning_scraper import _parse_table, _classify_severity, _venture_advisory

_CYCLONE_TABLE_HTML = """
<table class="tableData preliminary">
<tr><th>S.No</th><th>Issue Date Time</th><th>Message</th><th>Warning</th><th>File</th></tr>
<tr>
  <td>1</td>
  <td>13-09-2026 12:30:00</td>
  <td>Squally weather with strong winds along the coast very likely to prevail.</td>
  <td>Fishermen are advised not to venture into the sea</td>
  <td><a href="uploads/archive/45/foo_fishermen.pdf">pdf</a></td>
</tr>
<tr>
  <td>2</td>
  <td>13-09-2026 16:00:00</td>
  <td>Squally weather with strong winds likely to prevail.</td>
  <td>Fishermen are advised to be cautious while venturing into the sea</td>
  <td><a href="uploads/archive/45/bar.pdf">pdf</a></td>
</tr>
</table>
"""
rows = _parse_table(_CYCLONE_TABLE_HTML)
check("parses both rows", len(rows), 2)
check("row 1 venture_advisory=True (explicit 'not to venture')", rows[0]["venture_advisory"], True)
check("row 1 severity=HIGH", rows[0]["severity"], "HIGH")
check("row 2 venture_advisory=False ('cautious', not 'not to venture')", rows[1]["venture_advisory"], False)
check("row 2 severity=MEDIUM (squally, no venture prohibition)", rows[1]["severity"], "MEDIUM")
check("pdf_url resolved to absolute", rows[0]["pdf_url"], "https://rsmcnewdelhi.imd.gov.in/uploads/archive/45/foo_fishermen.pdf")

_NO_RECORDS_HTML = """
<table class="tableData preliminary">
<tr><th>S.No</th><th>Issue Date Time</th><th>Message</th><th>Warning</th><th>File</th></tr>
<tr><td colspan="5">No Records</td></tr>
</table>
"""
check("'No Records' row yields zero warnings, not an error", _parse_table(_NO_RECORDS_HTML), [])

check("NIL message + No Warning -> LOW", _classify_severity("NIL", "No Warning"), "LOW")
check("cyclone mention -> HIGH even without explicit venture phrase", _classify_severity("Cyclone approaching", "Stay alert"), "HIGH")


# ─── Phase 5: port warning table parsing + signal taxonomy ────────────────

section("Phase 5 — imd_port_warning_scraper")
from src.services.imd_port_warning_scraper import _parse_table as _parse_port_table, _classify_signal

_PORT_TABLE_HTML = """
<table class="tableData preliminary">
<tr><th>S.No</th><th>Issue Date Time</th><th>Message</th><th>Warning</th><th>File</th></tr>
<tr>
  <td>1</td><td>13-09-2026 12:30:00</td>
  <td>Squally weather likely.</td><td>LC3</td>
  <td><a href="uploads/archive/57/port.pdf">pdf</a></td>
</tr>
<tr>
  <td>2</td><td>13-09-2026 17:30:00</td>
  <td>No adverse weather.</td><td>NIL</td>
  <td><a href="uploads/archive/57/port2.pdf">pdf</a></td>
</tr>
</table>
"""
port_rows = _parse_port_table(_PORT_TABLE_HTML)
check("parses both port rows", len(port_rows), 2)
check("LC3 -> MEDIUM (per IMD's official signal table)", port_rows[0]["severity"], "MEDIUM")
check("LC3 -> signal_name 'Local Cautionary'", port_rows[0]["signal_name"], "Local Cautionary")
check("NIL -> NONE severity", port_rows[1]["severity"], "NONE")

# Every official signal from IMD's port-warning.pdf, spot-checked.
check("DC1 -> LOW (distant, port not affected)", _classify_signal("DC1")["severity"], "LOW")
check("GD10 -> CRITICAL (great danger, crosses over/near port)", _classify_signal("GD10")["severity"], "CRITICAL")
check("XI -> UNKNOWN (communication failure, not a weather severity)", _classify_signal("XI")["severity"], "UNKNOWN")
# Roman-numeral alias variant, normalized before lookup.
check("'LC-III' alias normalizes to LC3's MEDIUM", _classify_signal("LC-III")["severity"], "MEDIUM")
# Never guess: an unrecognized code must NOT get a fabricated severity.
result = _classify_signal("ZZ99")
check("unrecognized code -> severity None (never guessed)", result["severity"], None)
check("unrecognized code -> raw text still preserved", result["signal_code"], "ZZ99")


# ─── Summary ────────────────────────────────────────────────────────────

print(f"\n{_checks - _failures}/{_checks} checks passed")
if _failures:
    print(f"{_failures} FAILED")
    sys.exit(1)
