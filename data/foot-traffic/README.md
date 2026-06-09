# Seattle Foot Traffic Data

Source archive: `foot_data.zip`
Source CSV: `seattle.sample.daily.csv`

## Contents

- `seattle_daily_cell_activity_clean.csv.gz`: cleaned cell-day table. Duplicate `(date, geography)` rows are collapsed by summing `activity_index_total`; `source_row_count` records how many source rows were combined.
- `seattle_daily_summary.csv`: one row per day with total activity and cell counts.
- `seattle_cell_summary.csv`: one row per grid cell, sorted by total activity descending.
- `seattle_foot_traffic_profile.json`: curation and QA metadata.

## Profile

- Raw rows: 356,719
- Clean cell-day rows: 324,908
- Duplicate rows collapsed: 31,811
- Exact duplicate rows in source: 40
- Date range: 2020-01-01 to 2020-01-31 (31 days)
- Unique geographies: 23,027
- Latitude range: 47.54177 to 47.69081
- Longitude range: -122.39388 to -122.16591
- Missing values: none found
- Invalid numeric/date/bounds values: none found

## Notes

`activity_index_total` appears to be an index, not an observed pedestrian count. The source has repeated grid cell/day rows with identical geometry and different activity values, so the curated table sums those values into a single cell-day activity index.
