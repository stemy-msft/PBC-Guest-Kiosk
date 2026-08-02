# CHEATSHEET.md

# PBC Visitor Kiosk Settings Cheat Sheet

This document provides a cheat sheet for where to make changes.
In some cases, only a portion of the settings are shown below. 

---

# .\.env

## This controls backend environment (copy from .env.example; never commit the real .env)

JWT_SECRET_KEY=replace-with-a-long-random-secret       <-- REQUIRED; changing it logs everyone out
JWT_ALGORITHM=HS256
JWT_EXPIRE_MINUTES=480
PBC_DEFAULT_ADMIN_USERNAME=admin                       <-- initial admin (created only if none exists)
PBC_DEFAULT_ADMIN_PASSWORD=replace-with-a-strong-password  <-- must be changed at first login
PBC_DEFAULT_ADMIN_DISPLAY_NAME=Administrator

# .\frontend\.env

## This controls the frontend environment

VITE_API_BASE=http://kiosk-backend.domain.local:8000        <-- name/ip of backend


# .\print-agent\.env

## This controls the print-agent environment

PBC_API_BASE=http://kiosk-backend.domain.local:8000         <-- name/ip of backend
PBC_PRINTER_NAME=QL800_BROTHER                              <-- name of print queue on Raspberry Pi
PBC_PRINT_AGENT_POLL_SECONDS=2                              <-- frequency print-agent polls backend

# .\backend\app\services\badge_service.py

## This controls the creation of the PNG for the badge that might need modified if a different printer is used

photo = ImageEnhance.Brightness(photo).enhance(1.0)         <-- Brightness
photo = ImageEnhance.Contrast(photo).enhance(0.85)          <-- Contrast
photo = ImageOps.grayscale(photo).convert("RGB")            <-- Greyscale conversion

## Badge width/height are read from the active layout, not from constants here:
##   LAYOUT = BADGE_LAYOUTS["PBC_standard"]
## To change badge dimensions, edit the PBC_standard entry in badge_layouts.py:

# .\backend\app\services\badge_layouts.py

"width": 1100                                               <-- Badge width
"height": 696                                              <-- Badge height

