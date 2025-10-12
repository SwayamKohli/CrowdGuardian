import osmnx as ox
import networkx as nx
import json
import sys

def calculate_route(start_lat, start_lng, end_lat, end_lng, city_name="Delhi, India"):
    """
    Calculates an evacuation route between two coordinates using OpenStreetMap data.
    Loads a localized graph (1.5km buffer) around the start point to ensure accurate node snapping.

    Args:
        start_lat (float): Latitude of the starting point.
        start_lng (float): Longitude of the starting point.
        end_lat (float): Latitude of the ending point.
        end_lng (float): Longitude of the ending point.
        city_name (str): Name of the city (used for context/fallback).

    Returns:
        dict: Route data including coordinates, distance, and status.
    """
    try:
        # FIX: Load a localized graph around the start point (1500m buffer)
        # This prevents the algorithm from snapping to a distant central node.
        G = ox.graph_from_point(
            (start_lat, start_lng), 
            dist=1500,  # 1.5 km radius around the starting point
            network_type="walk"
        )
        
        # Note: nearest_nodes expects (longitude, latitude)
        orig_node = ox.distance.nearest_nodes(G, start_lng, start_lat)
        dest_node = ox.distance.nearest_nodes(G, end_lng, end_lat)

        route = nx.shortest_path(G, orig_node, dest_node, weight='length')
        route_length_m = nx.shortest_path_length(G, orig_node, dest_node, weight='length')
        route_length_km = route_length_m / 1000

        # Coordinates are extracted as (latitude, longitude) for Leaflet compatibility
        coords = [(G.nodes[n]["y"], G.nodes[n]["x"]) for n in route]
        route_data = [list(coord) for coord in coords]

        response_data = {
            "status": "success",
            "route_coordinates": route_data,
            "distance_kms": round(route_length_km, 3),
            "start_point": [start_lat, start_lng],
            "end_point": [end_lat, end_lng]
        }

        return response_data

    except nx.NetworkXNoPath:
        return {
            "status": "error",
            "message": f"No walkable path found between the origin ({start_lat}, {start_lng}) and destination ({end_lat}, {end_lng}). Ensure both points are near roads in the loaded graph area."
        }
    except Exception as e:
        return {
            "status": "error",
            "message": f"An unexpected error occurred while calculating the route: {str(e)}"
        }

if __name__ == "__main__":
    if len(sys.argv) < 5:
        print(json.dumps({
            "status": "error",
            "message": "Insufficient arguments. Expected: start_lat, start_lng, end_lat, end_lng, [city_name]"
        }))
        sys.exit(1)

    try:
        start_lat = float(sys.argv[1])
        start_lng = float(sys.argv[2])
        end_lat = float(sys.argv[3])
        end_lng = float(sys.argv[4])
        city_name = sys.argv[5] if len(sys.argv) > 5 else "Delhi, India"

        result = calculate_route(start_lat, start_lng, end_lat, end_lng, city_name)
        print(json.dumps(result, indent=2, default=str))

    except ValueError:
        print(json.dumps({
            "status": "error",
            "message": "Invalid coordinate format. Please provide numeric values for lat/lng."
        }))
        sys.exit(1)