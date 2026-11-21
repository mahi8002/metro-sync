"""Build route-distance edges from official GTFS stop sequences and track shapes.
Usage: python scripts/build-transit-network.py feed.zip data/transit-network.json
Only standard-library modules are used. No straight-line train-distance fallback.
"""
import csv
import datetime
import hashlib
import io
import json
import math
import sys
import zipfile
from pathlib import Path

R = 6371.0088


def haversine(a, b):
    lat1, lon1, lat2, lon2 = map(math.radians, (*a, *b))
    h = math.sin((lat2-lat1)/2)**2 + math.cos(lat1)*math.cos(lat2)*math.sin((lon2-lon1)/2)**2
    return R * 2 * math.asin(min(1, math.sqrt(h)))


def build(archive_path, output_path):
    archive = zipfile.ZipFile(archive_path)
    def rows(name):
        return csv.DictReader(io.TextIOWrapper(archive.open(name), encoding='utf-8-sig', newline=''))
    stops = {r['stop_id']: {'name': r['stop_name'], 'lat': float(r['stop_lat']), 'lon': float(r['stop_lon']),
                           'parent': r.get('parent_station', ''), 'station': r.get('location_type') == '1'} for r in rows('stops.txt')}
    shapes = {}
    for row in rows('shapes.txt'):
        shapes.setdefault(row['shape_id'], []).append((int(row['shape_pt_sequence']), float(row['shape_pt_lat']), float(row['shape_pt_lon'])))
    shapes = {key: [(lat, lon) for _, lat, lon in sorted(points)] for key, points in shapes.items()}
    cumulative = {}
    for key, points in shapes.items():
        lengths = [0.0]
        for a, b in zip(points, points[1:]):
            lengths.append(lengths[-1] + haversine(a, b))
        cumulative[key] = lengths
    trips = {r['trip_id']: (r['route_id'], r['shape_id'], r['direction_id']) for r in rows('trips.txt')}
    projections = {}
    def project(shape_id, stop_id):
        key = shape_id, stop_id
        if key in projections:
            return projections[key]
        stop = stops[stop_id]
        lat, lon = stop['lat'], stop['lon']
        scale = math.cos(math.radians(lat))
        best = None
        for index, (a, b) in enumerate(zip(shapes[shape_id], shapes[shape_id][1:])):
            ax, ay = (a[1]-lon)*scale, a[0]-lat
            bx, by = (b[1]-lon)*scale, b[0]-lat
            dx, dy = bx-ax, by-ay
            fraction = max(0, min(1, -(ax*dx+ay*dy)/(dx*dx+dy*dy))) if dx*dx+dy*dy else 0
            error = (ax+fraction*dx)**2 + (ay+fraction*dy)**2
            if best is None or error < best[0]:
                point = (a[0]+fraction*(b[0]-a[0]), a[1]+fraction*(b[1]-a[1]))
                position = cumulative[shape_id][index] + fraction*(cumulative[shape_id][index+1]-cumulative[shape_id][index])
                best = error, position, index, point
        if best is None or haversine((lat, lon), best[3]) > .15:
            projections[key] = None
        else:
            projections[key] = best[1:]
        return projections[key]
    edges, patterns = {}, set()
    rejected = 0
    def seconds(value):
        h, m, s = map(int, value.split(':'))
        return h*3600 + m*60 + s
    def process(trip_id, sequence):
        nonlocal rejected
        if trip_id not in trips:
            return
        route, shape, direction = trips[trip_id]
        sequence.sort(key=lambda row: int(row['stop_sequence']))
        signature = route, shape, tuple(r['stop_id'] for r in sequence)
        if signature in patterns or shape not in shapes:
            return
        patterns.add(signature)
        for previous, current in zip(sequence, sequence[1:]):
            a, b = previous['stop_id'], current['stop_id']
            if a not in stops or b not in stops:
                continue
            start, end = project(shape, a), project(shape, b)
            if not start or not end or end[0] <= start[0] or end[0]-start[0] > 100:
                rejected += 1
                continue
            duration = seconds(current['arrival_time'])-seconds(previous['departure_time'])
            if duration <= 0 or duration > 7200:
                rejected += 1
                continue
            key = a, b, route
            edge = {'to': b, 'route': route, 'direction': direction, 'seconds': duration,
                    'distanceKm': round(end[0]-start[0], 6), 'shape': shape,
                    'startIndex': start[1], 'endIndex': end[1],
                    'startPoint': [round(x, 6) for x in start[2]], 'endPoint': [round(x, 6) for x in end[2]]}
            if key not in edges or duration < edges[key]['seconds']:
                edges[key] = edge
    # GTFS commonly groups rows by trip. Even if it does not, a fragment with
    # a single stop produces no edges rather than fabricated connections.
    last_trip, sequence, finished_trips = None, [], set()
    for row in rows('stop_times.txt'):
        if last_trip is not None and row['trip_id'] != last_trip:
            process(last_trip, sequence)
            finished_trips.add(last_trip)
            if row['trip_id'] in finished_trips:
                raise ValueError('stop_times must group each trip contiguously; sort the feed before building')
            sequence = []
        last_trip = row['trip_id']
        sequence.append(row)
    if last_trip is not None:
        process(last_trip, sequence)
    graph = {}
    for (a, _, _), edge in edges.items():
        graph.setdefault(a, []).append(edge)
    transfers = []
    for row in rows('transfers.txt'):
        if row['transfer_type'] == '3' or row['from_stop_id'] == row['to_stop_id']:
            continue
        if row['from_stop_id'] in stops and row['to_stop_id'] in stops:
            transfers.append({'from': row['from_stop_id'], 'to': row['to_stop_id'],
                              'seconds': max(60, int(row.get('min_transfer_time') or 180))})
    used_shapes = {edge['shape'] for edge in edges.values()}
    result = {'version': 1, 'source': 'https://rrgtfsfeeds.s3.amazonaws.com/gtfs_subway.zip',
              'generatedAt': datetime.datetime.now(datetime.timezone.utc).isoformat(),
              'archiveSha256': hashlib.sha256(Path(archive_path).read_bytes()).hexdigest(),
              'feedInfo': list(rows('feed_info.txt')), 'stops': stops, 'edges': graph,
              'shapes': {key: [[round(x, 6) for x in p] for p in shapes[key]] for key in sorted(used_shapes)},
              'transfers': transfers,
              'notes': 'Static normal-service patterns, not departure-time or live service availability; train km measured along shapes; walks excluded.',
              'stats': {'trainEdges': len(edges), 'patterns': len(patterns), 'unmatchedEdgesSkipped': rejected}}
    Path(output_path).parent.mkdir(parents=True, exist_ok=True)
    Path(output_path).write_text(json.dumps(result, separators=(',', ':')), encoding='utf-8')
    print(json.dumps(result['stats']), 'bytes:', Path(output_path).stat().st_size)


if __name__ == '__main__':
    build(sys.argv[1], sys.argv[2])
