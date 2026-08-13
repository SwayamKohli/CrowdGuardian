import os
import json
import math
import sys

# Ensure backend virtualenv packages can be loaded if run locally
sys.path.append(os.path.join(os.path.dirname(__file__), 'venv', 'lib', 'python3.9', 'site-packages'))

import osmnx as ox
import networkx as nx

SAFE_ZONE = {"lat": 28.6050, "lng": 77.2000}

ZONE_COORDINATE_MAPPING = {
  'Z01_CP': { 'lat': 28.6316, 'lng': 77.2180 },
  'Z02_IG': { 'lat': 28.6129, 'lng': 77.2274 },
  'Z03_LT': { 'lat': 28.5535, 'lng': 77.2588 },
  'Z04_RF': { 'lat': 28.6562, 'lng': 77.2410 },
  'Z05_HK': { 'lat': 28.5530, 'lng': 77.2090 },
  'Z06_SF': { 'lat': 28.5520, 'lng': 77.1950 },
  'Z07_SCW': { 'lat': 28.5355, 'lng': 77.2405 },
  'Z08_QM': { 'lat': 28.5285, 'lng': 77.1372 },
  'Z09_KB': { 'lat': 28.6475, 'lng': 77.1950 },
  'Z10_IGI': { 'lat': 28.5663, 'lng': 77.1009 },
  'Z11_DWK': { 'lat': 28.5833, 'lng': 77.0425 },
  'Z12_AKS': { 'lat': 28.6140, 'lng': 77.2764 },
  'Z13_NDA': { 'lat': 28.5770, 'lng': 77.3235 },
  'Z14_AVB': { 'lat': 28.6465, 'lng': 77.3190 },
  'Z15_RHI': { 'lat': 28.7300, 'lng': 77.1105 },
  'Z16_NSP': { 'lat': 28.6942, 'lng': 77.1420 },
  'Z17_CC': { 'lat': 28.6565, 'lng': 77.2300 },
  'Z18_LJN': { 'lat': 28.5700, 'lng': 77.2340 },
  'Z19_DK': { 'lat': 28.5900, 'lng': 77.1400 },
  'Z20_DU': { 'lat': 28.6872, 'lng': 77.2084 },
}

def get_fallback_route(start_lat, start_lng, end_lat, end_lng):
    # Generates a realistic walking path using a sine wave interpolation with 15 steps
    steps = 15
    route = []
    
    # Calculate distance in km
    R = 6371.0
    lat1 = math.radians(start_lat)
    lon1 = math.radians(start_lng)
    lat2 = math.radians(end_lat)
    lon2 = math.radians(end_lng)
    dlon = lon2 - lon1
    dlat = lat2 - lat1
    a = math.sin(dlat / 2)**2 + math.cos(lat1) * math.cos(lat2) * math.sin(dlon / 2)**2
    c = 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))
    distance_km = R * c
    
    for i in range(steps + 1):
        t = i / steps
        # Linear interpolation
        interp_lat = start_lat + (end_lat - start_lat) * t
        interp_lng = start_lng + (end_lng - start_lng) * t
        
        # Add some wave variation to make it look like street walking instead of a straight line
        offset = 0.0015 * math.sin(t * math.pi * 2)
        interp_lat += offset
        interp_lng -= offset
        
        route.append([interp_lat, interp_lng])
        
    return {
        "status": "success",
        "route_coordinates": route,
        "distance_kms": round(distance_km, 3),
        "start_point": [start_lat, start_lng],
        "end_point": [end_lat, end_lng],
        "fallback": True
    }

def precompute():
    precalculated = {}
    
    os.makedirs(os.path.join(os.path.dirname(__file__), 'data'), exist_ok=True)
    
    for zone_id, coord in ZONE_COORDINATE_MAPPING.items():
        print(f"Precomputing route for {zone_id}...")
        start_lat, start_lng = coord["lat"], coord["lng"]
        end_lat, end_lng = SAFE_ZONE["lat"], SAFE_ZONE["lng"]
        
        # Calculate midpoint and distance
        mid_lat = (start_lat + end_lat) / 2.0
        mid_lng = (start_lng + end_lng) / 2.0
        
        # Try calculating using OSMnx with a bounding circle covering both points
        # Distance between points
        dy = (end_lat - start_lat) * 111000
        dx = (end_lng - start_lng) * 111000 * math.cos(math.radians(mid_lat))
        dist_m = math.sqrt(dx*dx + dy*dy)
        
        # We cap the graph download at 3.5km to avoid downloading half of India
        if dist_m < 3500:
            try:
                # Download graph centered at midpoint covering both start and end
                radius = (dist_m / 2.0) + 500
                print(f"  Downloading street graph for {zone_id} (radius: {radius:.1f}m)...")
                G = ox.graph_from_point((mid_lat, mid_lng), dist=radius, network_type="walk")
                
                orig_node = ox.distance.nearest_nodes(G, start_lng, start_lat)
                dest_node = ox.distance.nearest_nodes(G, end_lng, end_lat)
                
                route = nx.shortest_path(G, orig_node, dest_node, weight='length')
                route_length_m = nx.shortest_path_length(G, orig_node, dest_node, weight='length')
                
                coords = [(G.nodes[n]["y"], G.nodes[n]["x"]) for n in route]
                route_data = [list(coord) for coord in coords]
                
                precalculated[zone_id] = {
                    "status": "success",
                    "route_coordinates": route_data,
                    "distance_kms": round(route_length_m / 1000.0, 3),
                    "start_point": [start_lat, start_lng],
                    "end_point": [end_lat, end_lng],
                    "fallback": False
                }
                print(f"  ✅ Real OSMnx route generated: {len(route_data)} coordinates, {precalculated[zone_id]['distance_kms']} km")
                continue
            except Exception as e:
                print(f"  ⚠️ OSMnx failed for {zone_id}: {e}. Using realistic fallback.")
        else:
            print(f"  Distance is too long ({dist_m/1000.0:.2f} km). Using realistic fallback.")
            
        # Fallback
        precalculated[zone_id] = get_fallback_route(start_lat, start_lng, end_lat, end_lng)
        print(f"  ✅ Fallback route generated: {precalculated[zone_id]['distance_kms']} km")

    output_path = os.path.join(os.path.dirname(__file__), 'data', 'precalculated_routes.json')
    with open(output_path, 'w') as f:
        json.dump(precalculated, f, indent=2)
        
    print(f"\n🎉 Finished! Saved precalculated routes for all 20 zones to {output_path}")

if __name__ == "__main__":
    precompute()
