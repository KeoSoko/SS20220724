#!/bin/bash
set -e

# Post-merge setup for Simple Slips.
#
# Only install dependencies here. Schema is intentionally NOT applied via
# `drizzle-kit push`: the database is shared/persistent across task
# environments (schema changes are already applied during each task), and
# `drizzle-kit push` is interactive and would attempt destructive drops of
# legacy `users` columns that still hold production data. Any schema change
# must be applied deliberately via SQL, never automatically here.
npm install
