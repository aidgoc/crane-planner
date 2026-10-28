# Grove GMK5250L-1 load chart, page 17

Source document: `2025-02-11_KB_MTW_PG_GMK5250L-1_V2.indd`

- Manufacturer: Grove / Manitowoc
- Model: GMK5250L-1
- Page: 17
- PDF metadata: Adobe InDesign 20.1, PDF Library 17.0
- Creation date: 2025-03-04 08:59:40 +01:00
- Local workspace copy: `Digital-Twin-Mobile-Crane/Digital-Twin-Mobile-Crane/Cycle-2/js/Grove-GMK5250L-1-load-chart.pdf`
- Official source URL: <https://www.manitowoc.com/media/15016/download>

The chart section used by M1 is the full-outrigger telescopic-boom table for
`13.3 - 70.0 m | 7.8 m | 360° | 80 t | EN 13000`.

Verified M1-supported cells from the PDF page 17 text extraction:

| Boom (m) | 5 | 8 | 10 | 12 | 15 | 20 | 30 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 13.3 | 121.0 | 84.5 | 64.5 | blank | blank | blank | blank |
| 23.6 | 111.0 | 83.5 | 68.0 | 57.0 | 45.0 | 27.0 | blank |
| 38.0 | 59.0 | 58.5 | 53.0 | 47.5 | 40.0 | 30.5 | 17.2 |
| 52.4 | blank | blank | 31.0 | 31.0 | 28.5 | 23.5 | 15.0 |
| 70.0 | blank | blank | blank | 14.5 | 14.5 | 14.5 | 12.1 |

The M1 implementation matches these values exactly for the 25 non-null cells and
keeps blank cells as `null`/not permitted.
