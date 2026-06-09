# Singapore LTA Foot Traffic Proxy

Source: LTA DataMall `PV/Bus` passenger volume joined to `BusStops` coordinates.

This is real public-transport passenger activity at Singapore bus stops. It should be labeled as transit-anchored pedestrian activity, not complete street pedestrian counts.

## Outputs

- `lta_bus_stop_activity.csv.gz`: hourly tap-in/tap-out records joined to bus-stop coordinates.
- `lta_bus_stop_summary.csv`: one row per matched bus stop, sorted by total volume descending.
- `lta_bus_stop_activity_points.json`: compact Mapbox/deck.gl point payload.
- `lta_foot_traffic_profile.json`: curation metadata.

## Current Build

- Month: 2026-03
- Bus stops fetched: 5,201
- Matched bus stops with activity: 5,193
- Activity records: 202,655
- Unmatched PT codes: 4
- Total tap-in + tap-out volume: 237,864,840

Weights in `lta_bus_stop_activity_points.json` are normalized against the 95th percentile bus-stop total volume, capped at 1.
