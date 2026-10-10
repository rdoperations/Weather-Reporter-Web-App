from fastapi import FastAPI, HTTPException
from fastapi.responses import FileResponse
from starlette.background import BackgroundTask
from pydantic import BaseModel, Field
from typing import Optional
from datetime import datetime
import os
import re
import sys
import json
import pytz

# weather_logic.py lives in the project root; make it importable regardless of how the
# function is launched (uvicorn locally, Vercel's runtime in production).
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from weather_logic import WeatherLogic, DEFAULT_TIMEZONE  # noqa: E402

app = FastAPI()

api_key_owm = os.environ.get("OPENWEATHERMAP_API_KEY", "")
logic = WeatherLogic(api_key=api_key_owm)

VALID_SOURCES = ("Open-Meteo", "OpenWeatherMap", "MET Norway", "Historical Data")
MAX_NAME_LEN = 200
MAX_HOURLY_ROWS = 2000  # 31 days of hourly data is 744 rows
PUBLIC_CONFIG_KEYS = ("locations", "default_location", "dashboard_locations")


class WeatherRequest(BaseModel):
    lat: float = Field(ge=-90, le=90)
    lon: float = Field(ge=-180, le=180)
    source: str = "Open-Meteo"
    location_name: Optional[str] = None


class PdfExportRequest(BaseModel):
    lat: float = Field(ge=-90, le=90)
    lon: float = Field(ge=-180, le=180)
    source: str = "Open-Meteo"
    location_name: str = Field(max_length=MAX_NAME_LEN)
    language: str = "en"  # "en" or "vi"


class CustomPdfExportRequest(BaseModel):
    lat: float = Field(ge=-90, le=90)
    lon: float = Field(ge=-180, le=180)
    source: str = Field(default="Historical Data", max_length=MAX_NAME_LEN)
    location_name: str = Field(max_length=MAX_NAME_LEN)
    language: str = "en"
    w_data: list = Field(max_length=MAX_HOURLY_ROWS)
    l_info: dict


def _clean_name(name: str) -> str:
    """Names are typed by users and end up inside ReportLab markup: drop angle brackets so a
    stray or unclosed tag cannot break PDF generation."""
    return re.sub(r"[<>]", "", name or "").strip()


def _check_source(source: str):
    if source not in VALID_SOURCES:
        raise HTTPException(status_code=400, detail=f"Unknown data source: {source}")


def _fetch_or_raise(lat: float, lon: float, source: str):
    """Fetch forecast data; surface upstream failures as a 502 instead of an empty 200."""
    _check_source(source)
    w_data, l_info = logic.fetch_weather(lat, lon, source=source)
    if not w_data:
        reason = (l_info or {}).get("_error") or "no data returned"
        raise HTTPException(status_code=502, detail=f"{source} request failed: {reason}")
    return w_data, l_info


def _fetch_marine(lat: float, lon: float, source: str, l_info: dict):
    if source == "Open-Meteo" and l_info and l_info.get("timezone"):
        try:
            return logic._fetch_marine_data_openmeteo(lat, lon, l_info["timezone"])
        except Exception as e:
            print(f"Marine data error: {e}")
    return None


def _pdf_response(filename: str):
    if filename and os.path.exists(filename):
        # Temp file is removed once the response has been sent.
        return FileResponse(
            path=filename,
            media_type="application/pdf",
            filename=os.path.basename(filename),
            background=BackgroundTask(os.remove, filename),
        )
    raise HTTPException(status_code=500, detail="Failed to generate PDF")


def _build_pdf(req, w_data, l_info, loc_name, m_data):
    builder = logic.generate_vietnamese_pdf_report if req.language == "vi" else logic.generate_pdf_report
    return builder(req.lat, req.lon, w_data, l_info, loc_name, req.source, m_data)


@app.get("/api/health")
def health_check():
    return {"status": "ok", "message": "FastAPI is running on Vercel"}


@app.get("/api/locations")
def get_locations():
    base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    candidates = [
        os.path.join(base_dir, "locations.json"),
        os.path.join(base_dir, "location.json"),
        os.path.join(base_dir, "config_LDC.json"),
        os.path.join(base_dir, "config.json"),
    ]
    for loc_file in candidates:
        if os.path.exists(loc_file):
            try:
                with open(loc_file, "r", encoding="utf-8") as f:
                    data = json.load(f)
                if isinstance(data, dict) and data.get("locations"):
                    # Whitelist keys so secrets in config files can never be exposed.
                    return {k: data[k] for k in PUBLIC_CONFIG_KEYS if k in data}
            except Exception:
                continue
    return {"locations": {}, "default_location": "", "dashboard_locations": []}


@app.post("/api/weather")
def get_weather(req: WeatherRequest):
    w_data, l_info = _fetch_or_raise(req.lat, req.lon, req.source)
    return {
        "weather_data": w_data,
        "location_info": l_info,
        "marine_data": _fetch_marine(req.lat, req.lon, req.source, l_info),
    }


@app.post("/api/export/pdf")
def export_pdf(req: PdfExportRequest):
    w_data, l_info = _fetch_or_raise(req.lat, req.lon, req.source)
    m_data = _fetch_marine(req.lat, req.lon, req.source, l_info)
    loc_name = _clean_name(req.location_name) or l_info.get("name", "Report")
    try:
        return _pdf_response(_build_pdf(req, w_data, l_info, loc_name, m_data))
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/export/pdf_custom")
def export_pdf_custom(req: CustomPdfExportRequest):
    if not req.w_data:
        raise HTTPException(status_code=400, detail="No data supplied for the report")
    # The chart helpers need timezone-aware datetime objects; the browser only sends strings.
    try:
        tz = pytz.timezone(req.l_info.get("timezone") or DEFAULT_TIMEZONE)
    except pytz.UnknownTimeZoneError:
        tz = pytz.timezone(DEFAULT_TIMEZONE)
    for item in req.w_data:
        if isinstance(item, dict) and "datetime_obj" not in item and item.get("datetime"):
            try:
                item["datetime_obj"] = tz.localize(datetime.fromisoformat(item["datetime"]))
            except ValueError:
                pass
    loc_name = _clean_name(req.location_name) or _clean_name(str(req.l_info.get("name", ""))) or "Report"
    try:
        return _pdf_response(_build_pdf(req, req.w_data, req.l_info, loc_name, None))
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
