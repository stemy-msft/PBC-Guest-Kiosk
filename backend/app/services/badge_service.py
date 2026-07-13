from pathlib import Path

from PIL import Image, ImageDraw, ImageFont, ImageOps
from PIL import ImageEnhance

BADGE_WIDTH = 1100
BADGE_HEIGHT = 696

BACKGROUND = "white"
FOREGROUND = "black"
BORDER = "black"


def _font(size: int, bold: bool = False):
    candidates = []

    if bold:
        candidates.extend(
            [
                "C:/Windows/Fonts/arialbd.ttf",
                "arialbd.ttf",
                "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
                "/usr/share/fonts/truetype/liberation2/LiberationSans-Bold.ttf",
            ]
        )

    candidates.extend(
        [
            "C:/Windows/Fonts/arial.ttf",
            "arial.ttf",
            "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
            "/usr/share/fonts/truetype/liberation2/LiberationSans-Regular.ttf",
        ]
    )

    for candidate in candidates:
        try:
            return ImageFont.truetype(candidate, size)
        except OSError:
            continue

    return ImageFont.load_default()


def _format_datetime(value):
    if value is None:
        return ""

    hour = value.hour
    minute = value.minute
    ampm = "AM"

    if hour == 0:
        display_hour = 12
    elif hour == 12:
        display_hour = 12
        ampm = "PM"
    elif hour > 12:
        display_hour = hour - 12
        ampm = "PM"
    else:
        display_hour = hour

    month = value.strftime("%b")
    return f"{month} {value.day}, {value.year} {display_hour}:{minute:02d} {ampm}"


def _fit_text(
    draw: ImageDraw.ImageDraw,
    text: str,
    max_width: int,
    start_size: int,
    min_size: int = 18,
    bold: bool = False,
):
    safe_text = text.strip() if text else ""
    size = start_size

    while size >= min_size:
        font = _font(size, bold=bold)
        box = draw.textbbox((0, 0), safe_text, font=font)
        text_width = box[2] - box[0]

        if text_width <= max_width:
            return font

        size -= 2

    return _font(min_size, bold=bold)


def _draw_label(
    draw: ImageDraw.ImageDraw,
    xy,
    label: str,
    value: str,
    label_font,
    value_font,
):
    x, y = xy
    safe_value = value or ""
    label_text = f"{label}: "

    draw.text((x, y), label_text, fill=FOREGROUND, font=label_font)

    label_box = draw.textbbox((x, y), label_text, font=label_font)
    label_width = label_box[2] - label_box[0]

    draw.text(
        (x + label_width, y),
        safe_value,
        fill=FOREGROUND,
        font=value_font,
    )


def generate_visitor_badge(visitor, output_path: Path) -> Path:
    output_path.parent.mkdir(parents=True, exist_ok=True)

    badge = Image.new("RGB", (BADGE_WIDTH, BADGE_HEIGHT), BACKGROUND)
    draw = ImageDraw.Draw(badge)

    draw.rectangle(
        (4, 4, BADGE_WIDTH - 5, BADGE_HEIGHT - 5),
        outline=BORDER,
        width=4,
    )

    draw.rectangle(
        (0, 0, BADGE_WIDTH, 80),
        fill=FOREGROUND,
    )

    title_font = _font(56, bold=True)
    draw.text(
        (BADGE_WIDTH // 2, 50),
        "PBC VISITOR",
        fill="white",
        font=title_font,
        anchor="mm",
    )

    photo_box = (20, 120, 500, 600)

    if visitor.photo_path and Path(visitor.photo_path).exists():
        photo = Image.open(visitor.photo_path).convert("RGB")
        photo = ImageOps.fit(
            photo,
            (480, 480),
            method=Image.Resampling.LANCZOS,
        )
        photo = ImageEnhance.Brightness(photo).enhance(1.0)
        photo = ImageEnhance.Contrast(photo).enhance(0.85)
        photo = ImageOps.grayscale(photo).convert("RGB")
        badge.paste(photo, (photo_box[0], photo_box[1]))
    else:
        draw.rectangle(photo_box, outline=FOREGROUND, width=3)
        missing_font = _font(22, bold=True)
        draw.text(
            (112, 143),
            "NO PHOTO",
            fill=FOREGROUND,
            font=missing_font,
            anchor="mm",
        )

    draw.rectangle(photo_box, outline=FOREGROUND, width=3)

    text_x = 540
    max_text_width = BADGE_WIDTH - text_x - 24

    first_name = visitor.first_name.strip().upper()
    last_name = visitor.last_name.strip().upper()

    first_name_font = _fit_text(
        draw=draw,
        text=first_name,
        max_width=max_text_width,
        start_size=72,
        min_size=42,
        bold=True,
    )

    last_name_font = _fit_text(
        draw=draw,
        text=last_name,
        max_width=max_text_width,
        start_size=54,
        min_size=30,
        bold=True,
    )

    draw.text(
        (text_x, 120),
        first_name,
        fill=FOREGROUND,
        font=first_name_font,
    )

    draw.text(
        (text_x, 210),
        last_name,
        fill=FOREGROUND,
        font=last_name_font,
    )

    type_font = _font(46, bold=True)
    draw.text(
        (text_x, 300),
        f"{visitor.visitor_type} Visitor",
        fill=FOREGROUND,
        font=type_font,
    )

    label_font = _font(38, bold=True)
    value_font = _font(38, bold=False)

    _draw_label(
        draw=draw,
        xy=(text_x, 390),
        label="Purpose",
        value=visitor.purpose,
        label_font=label_font,
        value_font=value_font,
    )

    draw.text(
        (text_x, 500),
        "Contact Name:",
        fill=FOREGROUND,
        font=label_font,
    )

    draw.text(
        (text_x, 560),
        visitor.host_name,
        fill=FOREGROUND,
        font=value_font,
    )

    check_font = _font(32, bold=True)
    check_in_text = _format_datetime(visitor.check_in_time)

    date_x = photo_box[0] + ((photo_box[2] - photo_box[0]) // 2)

    draw.text(
        (BADGE_WIDTH // 2, 640),
        check_in_text,
        fill=FOREGROUND,
        font=check_font,
        anchor="ma",
    )

    badge.save(output_path, format="PNG")
    return output_path