# CHEATSHEET.md

# PBC Visitor Kiosk Settings Cheat Sheet

This document provides a cheat sheet for where to make changes.
In some cases, only a portion of the settings are shown below. 

---

# .\.env

## This controls backend and frontend environment

STAFF_USERNAME=staff                                        <-- initial username
STAFF_PASSWORD=ChangeMeNow123!                              <-- initial password
JWT_SECRET_KEY=U6Kv4j5sM9zK2vR7wQ8cX3nLpT4fGhY1aBnR9eDz
JWT_ALGORITHM=HS256
JWT_EXPIRE_MINUTES=480
DATABASE_URL=sqlite:///data/kiosk.db3                       <-- sqlite database on backend
PRINT_AGENT_URL=http://kiosk-printer.domain.local:8001      <-- name/ip of RP print server

# .\print-agent\.env

## This controls the print-agent environment

PBC_API_BASE=http://kiosk-backend.domain.local:8000         <-- name/ip of backend
PBC_PRINTER_NAME=QL800_BROTHER                              <-- name of print queue on Raspberry Pi
PBC_PRINT_AGENT_POLL_SECONDS=2                              <-- frequency print-agent polls backend

# .\backend\apps\services\badge_service.py

## This controls the creation of the PNG for the badge that might need modified if a different printer is used

BADGE_WIDTH = 1100                                          <-- Badge width
BADGE_HEIGHT = 696                                          <-- Badge height
photo = ImageEnhance.Brightness(photo).enhance(1.0)         <-- Brightness
photo = ImageEnhance.Contrast(photo).enhance(0.85)          <-- Contrast
photo = ImageOps.grayscale(photo).convert("RGB")            <-- Greyscale conversion

