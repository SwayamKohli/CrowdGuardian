import osmnx as ox
import networkx as nx
import json
import sys

def calculate_route(start_lat, start_lng, end_lat, end_lng, city_name="Delhi, India"):
    try:
        # 🔧 Increased radius to 5000 meters to cover both start and safe zone
        G = ox.graph_from_point(
            (start_lat, start_lng), 
            dist=5000,  # Was 1500 → now 5000
            network_type="walk"
        )
        
        orig_node = ox.distance.nearest_nodes(G, start_lng, start_lat)
        dest_node = ox.distance.nearest_nodes(G, end_lng, end_lat)

        route = nx.shortest_path(G, orig_node, dest_node, weight='length')
        route_length_m = nx.shortest_path_length(G, orig_node, dest_node, weight='length')
        route_length_km = route_length_m / 1000

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
            "message": f"No walkable path found between ({start_lat}, {start_lng}) and ({end_lat}, {end_lng}). Try increasing graph radius."
        }
    except Exception as e:
        return {
            "status": "error",
            "message": f"Unexpected error: {str(e)}"
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