"""Generate the Agent Sidecar investor deck (.pptx).

Reproducible + editable: tweak here and re-run rather than hand-editing the slides.
Styled to match the dashboard (dark navy, cyan accent).

Usage: python scripts/build_demo_deck.py [output.pptx]
"""
from __future__ import annotations

import sys
from pathlib import Path

from pptx import Presentation
from pptx.dml.color import RGBColor
from pptx.enum.shapes import MSO_SHAPE
from pptx.enum.text import MSO_ANCHOR, PP_ALIGN
from pptx.oxml.ns import qn
from pptx.util import Emu, Inches, Pt

# Palette (matches the dashboard).
BG = RGBColor(0x0E, 0x11, 0x17)
PANEL = RGBColor(0x16, 0x1B, 0x25)
LINE = RGBColor(0x26, 0x2D, 0x3A)
TEXT = RGBColor(0xE7, 0xEC, 0xF3)
MUTED = RGBColor(0x98, 0xA3, 0xB5)
ACCENT = RGBColor(0x67, 0xE8, 0xF9)
GOOD = RGBColor(0x3F, 0xAE, 0x72)
AMBER = RGBColor(0xE0, 0xA3, 0x3E)
WHITE = RGBColor(0xFF, 0xFF, 0xFF)

FONT = "Arial"
EMU_W, EMU_H = Inches(13.333), Inches(7.5)


def _set_bg(slide, color=BG):
    fill = slide.background.fill
    fill.solid()
    fill.fore_color.rgb = color


def _text(shape, runs, *, align=PP_ALIGN.LEFT, anchor=MSO_ANCHOR.TOP, space_after=6):
    tf = shape.text_frame
    tf.word_wrap = True
    tf.vertical_anchor = anchor
    for margin in ("margin_left", "margin_right", "margin_top", "margin_bottom"):
        setattr(tf, margin, Pt(4))
    first = True
    for run in runs:
        para = tf.paragraphs[0] if first else tf.add_paragraph()
        first = False
        para.alignment = run.get("align", align)
        para.space_after = Pt(run.get("space_after", space_after))
        para.space_before = Pt(run.get("space_before", 0))
        if run.get("bullet"):
            _bullet(para)
        r = para.add_run()
        r.text = run["text"]
        r.font.name = FONT
        r.font.size = Pt(run.get("size", 18))
        r.font.bold = run.get("bold", False)
        r.font.italic = run.get("italic", False)
        r.font.color.rgb = run.get("color", TEXT)


def _bullet(paragraph):
    pPr = paragraph._pPr if paragraph._pPr is not None else paragraph.get_or_add_pPr()
    buChar = pPr.makeelement(qn("a:buChar"), {"char": "▪"})
    buClr = pPr.makeelement(qn("a:buClr"), {})
    srgb = buClr.makeelement(qn("a:srgbClr"), {"val": "67E8F9"})
    buClr.append(srgb)
    pPr.append(buClr)
    pPr.append(buChar)
    paragraph.level = 0


def _box(slide, left, top, width, height, *, fill=PANEL, line=LINE, radius=True):
    shape = slide.shapes.add_shape(
        MSO_SHAPE.ROUNDED_RECTANGLE if radius else MSO_SHAPE.RECTANGLE, left, top, width, height
    )
    shape.fill.solid()
    shape.fill.fore_color.rgb = fill
    shape.line.color.rgb = line
    shape.line.width = Pt(1)
    shape.shadow.inherit = False
    return shape


def _textbox(slide, left, top, width, height):
    return slide.shapes.add_textbox(left, top, width, height)


def _slide(prs):
    slide = prs.slides.add_slide(prs.slide_layouts[6])  # blank
    _set_bg(slide)
    return slide


def _header(slide, kicker, title):
    bar = slide.shapes.add_shape(MSO_SHAPE.RECTANGLE, Inches(0.6), Inches(0.55), Inches(0.09), Inches(0.9))
    bar.fill.solid()
    bar.fill.fore_color.rgb = ACCENT
    bar.line.fill.background()
    bar.shadow.inherit = False
    box = _textbox(slide, Inches(0.85), Inches(0.45), Inches(11.8), Inches(1.15))
    _text(
        box,
        [
            {"text": kicker.upper(), "size": 12, "bold": True, "color": ACCENT, "space_after": 2},
            {"text": title, "size": 30, "bold": True, "color": TEXT},
        ],
    )


def _arrow(slide, x1, y1, x2, y2, color=ACCENT):
    conn = slide.shapes.add_connector(2, x1, y1, x2, y2)  # straight
    conn.line.color.rgb = color
    conn.line.width = Pt(2.25)
    line_elem = conn.line._get_or_add_ln()
    tail = line_elem.makeelement(qn("a:tailEnd"), {"type": "triangle", "w": "med", "len": "med"})
    line_elem.append(tail)
    return conn


def _footer(slide, index, total):
    box = _textbox(slide, Inches(0.6), Inches(7.02), Inches(12.1), Inches(0.35))
    _text(
        box,
        [{"text": f"Agent Sidecar  ·  confidential  ·  {index}/{total}", "size": 9, "color": MUTED}],
    )


# ---- slides ---------------------------------------------------------------


def title_slide(prs):
    slide = _slide(prs)
    _box(slide, Inches(0.6), Inches(2.35), Inches(0.09), Inches(2.7), fill=ACCENT, line=ACCENT, radius=False)
    box = _textbox(slide, Inches(0.95), Inches(2.4), Inches(11.6), Inches(3.0))
    _text(
        box,
        [
            {"text": "AGENT SIDECAR", "size": 15, "bold": True, "color": ACCENT, "space_after": 6},
            {"text": "Stop paying for wasted agent work.", "size": 42, "bold": True, "color": TEXT, "space_after": 10},
            {
                "text": "A local control plane that runs beside coding agents — refining prompts before "
                "spend, catching wasteful runtime behavior, and proving the savings.",
                "size": 18,
                "color": MUTED,
            },
        ],
    )
    tag = _textbox(slide, Inches(0.95), Inches(6.2), Inches(11.6), Inches(0.5))
    _text(tag, [{"text": "Investor demo", "size": 13, "color": MUTED}])


def problem_slide(prs):
    slide = _slide(prs)
    _header(slide, "The problem", "Coding agents burn tokens on work that never ships")
    box = _textbox(slide, Inches(0.85), Inches(1.9), Inches(7.3), Inches(4.6))
    _text(
        box,
        [
            {"text": "Re-running failing tests, thrashing edits, chasing under-specified prompts.", "size": 20, "bold": True, "space_after": 14},
            {"text": "On a flat-rate plan, that waste is capacity you lose — you hit your limit Thursday and lose Friday.", "size": 18, "bullet": True, "color": MUTED, "space_after": 10},
            {"text": "On API billing, it's money — spent on tokens that produced nothing.", "size": 18, "bullet": True, "color": MUTED, "space_after": 10},
            {"text": "Nobody measures the waste per task, so nobody fixes it.", "size": 18, "bullet": True, "color": MUTED},
        ],
    )
    tile = _box(slide, Inches(8.5), Inches(2.1), Inches(4.1), Inches(3.1), fill=PANEL)
    t = _textbox(slide, Inches(8.7), Inches(2.35), Inches(3.7), Inches(2.7))
    _text(
        t,
        [
            {"text": "THE SCARCE RESOURCE", "size": 11, "bold": True, "color": AMBER, "space_after": 8},
            {"text": "Plan capacity", "size": 26, "bold": True, "space_after": 8},
            {"text": "Dollars measure the wrong scarcity. The value is stretching the capacity you already pay for.", "size": 15, "color": MUTED},
        ],
    )


def what_slide(prs):
    slide = _slide(prs)
    _header(slide, "What it is", "A local control plane, beside the agent")
    box = _textbox(slide, Inches(0.85), Inches(1.95), Inches(11.6), Inches(1.2))
    _text(
        box,
        [
            {"text": "Runs in a separate process next to Claude Code. Captures every session automatically, "
             "refines prompts before expensive execution, detects waste at runtime, and proves the savings —", "size": 19, "space_after": 4},
            {"text": "without prompts or code ever leaving the machine.", "size": 19, "bold": True, "color": ACCENT},
        ],
    )
    cards = [
        ("Capture", "Hooks + native OpenTelemetry feed the daemon. No manual instrumentation.", ACCENT),
        ("Refine", "On prompt submit, an on-device model ensemble scopes the task before spend.", ACCENT),
        ("Steer + measure", "Detectors flag repeated tests, thrash, drift. Assist-vs-control proves it.", ACCENT),
    ]
    x = Inches(0.85)
    for name, body, accent in cards:
        card = _box(slide, x, Inches(3.5), Inches(3.75), Inches(2.7))
        t = _textbox(slide, x + Inches(0.22), Inches(3.72), Inches(3.35), Inches(2.3))
        _text(
            t,
            [
                {"text": name, "size": 20, "bold": True, "color": accent, "space_after": 8},
                {"text": body, "size": 15, "color": MUTED},
            ],
        )
        x += Inches(3.95)


def architecture_slide(prs):
    slide = _slide(prs)
    _header(slide, "Architecture", "Intercept → refine → measure, all on-device")

    editor = _box(slide, Inches(0.7), Inches(2.7), Inches(2.7), Inches(1.4))
    _text(_inner(editor, slide), [
        {"text": "Editor", "size": 16, "bold": True, "space_after": 4},
        {"text": "VS Code / Claude Code chat", "size": 12, "color": MUTED},
    ], anchor=MSO_ANCHOR.MIDDLE)

    daemon = _box(slide, Inches(4.35), Inches(2.15), Inches(4.3), Inches(2.9), fill=PANEL, line=ACCENT)
    _text(_inner(daemon, slide), [
        {"text": "Agent Sidecar daemon", "size": 17, "bold": True, "color": ACCENT, "space_after": 6},
        {"text": "FastAPI · 127.0.0.1", "size": 12, "color": MUTED, "space_after": 8},
        {"text": "captures hooks + OTLP", "size": 13, "bullet": True, "space_after": 4},
        {"text": "detectors: repeated tests, thrash, drift", "size": 13, "bullet": True, "space_after": 4},
        {"text": "measures cost + tokens", "size": 13, "bullet": True},
    ], anchor=MSO_ANCHOR.TOP)

    models = _box(slide, Inches(4.35), Inches(5.4), Inches(4.3), Inches(1.2), fill=PANEL)
    _text(_inner(models, slide), [
        {"text": "On-device model ensemble", "size": 14, "bold": True, "space_after": 3},
        {"text": "llama / deepseek — refine prompt → task contract", "size": 12, "color": MUTED},
    ], anchor=MSO_ANCHOR.MIDDLE)

    dash = _box(slide, Inches(9.6), Inches(2.15), Inches(3.05), Inches(1.75), fill=PANEL)
    _text(_inner(dash, slide), [
        {"text": "Dashboard", "size": 16, "bold": True, "space_after": 4},
        {"text": "plan multiplier, tokens saved, assist vs control", "size": 12, "color": MUTED},
    ], anchor=MSO_ANCHOR.MIDDLE)

    cloud = _box(slide, Inches(9.6), Inches(4.2), Inches(3.05), Inches(1.75), fill=PANEL, line=GOOD)
    _text(_inner(cloud, slide), [
        {"text": "Cloud (optional)", "size": 15, "bold": True, "color": GOOD, "space_after": 4},
        {"text": "Google sign-in · aggregates only, never prompts/code", "size": 12, "color": MUTED},
    ], anchor=MSO_ANCHOR.MIDDLE)

    _arrow(slide, Inches(3.4), Inches(3.4), Inches(4.35), Inches(3.4))          # editor -> daemon
    _arrow(slide, Inches(6.5), Inches(5.05), Inches(6.5), Inches(5.4), ACCENT)  # daemon <-> models
    _arrow(slide, Inches(6.5), Inches(5.4), Inches(6.5), Inches(5.05), ACCENT)
    _arrow(slide, Inches(8.65), Inches(3.0), Inches(9.6), Inches(3.0))          # daemon -> dashboard
    _arrow(slide, Inches(8.65), Inches(4.6), Inches(9.6), Inches(5.05), GOOD)   # daemon -> cloud

    note = _textbox(slide, Inches(0.7), Inches(6.35), Inches(3.2), Inches(0.7))
    _text(note, [{"text": "The prompt is intercepted before it reaches the model.", "size": 12, "italic": True, "color": MUTED}])


def _inner(box_shape, slide):
    # A textbox sized to sit inside a shape (python-pptx shape text is finicky with wrapping).
    return _textbox(slide, box_shape.left + Inches(0.18), box_shape.top + Inches(0.12),
                    box_shape.width - Inches(0.36), box_shape.height - Inches(0.24))


def proof_slide(prs):
    slide = _slide(prs)
    _header(slide, "Why it's credible", "Assist vs control — a measurement, not a claim")
    box = _textbox(slide, Inches(0.85), Inches(1.95), Inches(11.6), Inches(1.6))
    _text(
        box,
        [
            {"text": "Sessions are randomly split into an assisted arm and a silent control arm. Detectors "
             "still run in control, but nothing is delivered — that's the true, unsteered baseline.", "size": 19, "space_after": 6},
            {"text": "We compare tokens per completed prompt across the two. Same measurement, in the "
             "currency the user actually experiences.", "size": 18, "color": MUTED},
        ],
    )
    left = _box(slide, Inches(0.85), Inches(3.9), Inches(5.6), Inches(2.4), fill=PANEL, line=GOOD)
    _text(_inner(left, slide), [
        {"text": "ASSIST ARM", "size": 13, "bold": True, "color": GOOD, "space_after": 6},
        {"text": "Refined prompts + live steering", "size": 16, "space_after": 6},
        {"text": "Fewer wasted iterations → fewer tokens per completed task.", "size": 14, "color": MUTED},
    ])
    right = _box(slide, Inches(6.75), Inches(3.9), Inches(5.6), Inches(2.4), fill=PANEL, line=AMBER)
    _text(_inner(right, slide), [
        {"text": "CONTROL ARM", "size": 13, "bold": True, "color": AMBER, "space_after": 6},
        {"text": "Untouched baseline", "size": 16, "space_after": 6},
        {"text": "The waste we would have prevented — measured, not guessed.", "size": 14, "color": MUTED},
    ])


def numbers_slide(prs):
    slide = _slide(prs)
    _header(slide, "The dashboard", "What an investor sees, live")
    tiles = [
        ("1.31×", "Plan multiplier", "work the same plan delivers", GOOD),
        ("23.5%", "Cost savings", "measured, this run", GOOD),
        ("13.7k", "Tokens saved", "≈ extra capacity per window", ACCENT),
        ("6 / 3", "Assist / control", "randomized measurement arms", ACCENT),
    ]
    x = Inches(0.85)
    for value, label, detail, accent in tiles:
        _box(slide, x, Inches(2.15), Inches(2.85), Inches(2.2), fill=PANEL)
        t = _textbox(slide, x + Inches(0.2), Inches(2.35), Inches(2.5), Inches(1.85))
        _text(
            t,
            [
                {"text": value, "size": 34, "bold": True, "color": accent, "space_after": 4},
                {"text": label, "size": 15, "bold": True, "space_after": 2},
                {"text": detail, "size": 12, "color": MUTED},
            ],
        )
        x += Inches(3.0)
    strip = _textbox(slide, Inches(0.85), Inches(4.8), Inches(11.7), Inches(1.6))
    _text(
        strip,
        [
            {"text": "Interventions this run:  6 prompts refined  ·  6 live steers  ·  3 waste detections (control).", "size": 17, "space_after": 8},
            {"text": "Numbers above are from the seeded demo dataset; scripts/demo.sh --e2e runs the real "
             "baseline-vs-sidecar comparison end to end.", "size": 13, "italic": True, "color": MUTED},
        ],
    )


def moat_slide(prs):
    slide = _slide(prs)
    _header(slide, "Why it's safe (and defensible)", "Local-first by design")
    box = _textbox(slide, Inches(0.85), Inches(2.0), Inches(11.6), Inches(4.2))
    _text(
        box,
        [
            {"text": "Prompts and code never leave the machine.", "size": 22, "bold": True, "color": ACCENT, "space_after": 14},
            {"text": "The daemon binds localhost only; traces are append-only on disk.", "size": 18, "bullet": True, "color": MUTED, "space_after": 10},
            {"text": "The optional cloud dashboard receives aggregate numbers only — token counts, costs, "
             "intervention counts — keyed to a hash of the account, never an email or a prompt.", "size": 18, "bullet": True, "color": MUTED, "space_after": 10},
            {"text": "Google sign-in with stateless sessions; we store the least data that makes the product work.", "size": 18, "bullet": True, "color": MUTED},
        ],
    )


def demo_slide(prs):
    slide = _slide(prs)
    _header(slide, "Live demo", "Three acts, one command: scripts/demo.sh")
    steps = [
        ("1  Architecture", "Walk this deck's flow — intercept, refine, measure, all on-device.", ACCENT),
        ("2  Dashboard", "The tab that opens: plan multiplier, tokens saved, assist vs control.", ACCENT),
        ("3  Live", "Type a vague prompt (“fix the failing tests”) in the chat. The hook intercepts it, "
                    "the ensemble scopes it into a task contract, and a new Prompt row appears in ~2s.", GOOD),
    ]
    y = Inches(2.1)
    for name, body, accent in steps:
        _box(slide, Inches(0.85), y, Inches(11.6), Inches(1.35), fill=PANEL)
        t = _textbox(slide, Inches(1.1), y + Inches(0.16), Inches(11.1), Inches(1.05))
        _text(
            t,
            [
                {"text": name, "size": 18, "bold": True, "color": accent, "space_after": 3},
                {"text": body, "size": 15, "color": MUTED},
            ],
        )
        y += Inches(1.55)
    close = _textbox(slide, Inches(0.85), Inches(6.8), Inches(11.6), Inches(0.5))
    _text(close, [{"text": "“Every prompt you just saw was intercepted, scoped, and measured — on this machine, before a dollar of model spend.”",
                   "size": 14, "italic": True, "color": TEXT}])


def build(path: Path) -> Path:
    prs = Presentation()
    prs.slide_width = EMU_W
    prs.slide_height = EMU_H
    builders = [title_slide, problem_slide, what_slide, architecture_slide, proof_slide, numbers_slide, moat_slide, demo_slide]
    for fn in builders:
        fn(prs)
    total = len(prs.slides)
    for index, slide in enumerate(prs.slides, start=1):
        if index > 1:
            _footer(slide, index, total)
    prs.save(str(path))
    return path


if __name__ == "__main__":
    out = Path(sys.argv[1]) if len(sys.argv) > 1 else Path("docs/AgentSidecar_Investor_Demo.pptx")
    out.parent.mkdir(parents=True, exist_ok=True)
    build(out)
    print(f"Wrote {out}")
