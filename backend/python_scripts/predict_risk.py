import sys
import pickle
import pandas as pd
import numpy as np
import json 

def load_model_and_scaler(model_path, scaler_path):
    """
    Loads the trained ML model and scaler objects from pickle files.

    :param model_path: Path to the serialized model file (.pkl).
    :param scaler_path: Path to the serialized scaler file (.pkl).
    :return: Tuple containing the loaded model and scaler instances.
    """
    try:
        with open(model_path, 'rb') as model_file:
            model = pickle.load(model_file)
        with open(scaler_path, 'rb') as scaler_file:
            scaler = pickle.load(scaler_file)
        return model, scaler
    except FileNotFoundError as e:
        print(f"Error: Required file not found - {e}")
        sys.exit(1)
    except Exception as e:
        print(f"Error loading model/scaler: {e}")
        sys.exit(1)

def predict_risk(model, scaler, input_data):
    """
    Makes a prediction using the loaded model and scaler.

    :param model: The trained machine learning model.
    :param scaler: The fitted data scaler (e.g., StandardScaler).
    :param input_data: A dictionary containing the features.
    :return: The predicted risk level as a string.
    """
    try:
        # Define feature names and their order, which must match the training phase
        feature_names = ['crowd_density', 'avg_flow_speed', 'rate_of_change_density', 'hour_of_day']
        
        # Convert single input record into a DataFrame
        input_df = pd.DataFrame([input_data], columns=feature_names)

        # Apply the scaling transformation
        input_scaled = scaler.transform(input_df)

        # Make the prediction and extract the scalar result
        prediction = model.predict(input_scaled)[0]

        return str(prediction)

    except KeyError as e:
        print(f"Error: Missing required feature in input data - {e}")
        sys.exit(1)
    except ValueError as e:
        print(f"Error: Invalid value in input data - {e}")
        sys.exit(1)
    except Exception as e:
        print(f"Error during prediction: {e}")
        sys.exit(1)

if __name__ == "__main__":
    # Define paths to the saved ML assets
    model_path = './models/stampede_model.pkl'
    scaler_path = './models/scaler.pkl'

    # Load the model and scaler objects
    model, scaler = load_model_and_scaler(model_path, scaler_path)

    # Validate command line arguments
    if len(sys.argv) < 2:
        print("Error: No input data provided. Expected JSON string as first argument.")
        sys.exit(1)

    try:
        # Parse the input JSON string provided via command line
        input_json_str = sys.argv[1]
        input_data = json.loads(input_json_str)

        # Validate that all required keys are present
        required_keys = {'crowd_density', 'avg_flow_speed', 'rate_of_change_density', 'hour_of_day'}
        if not required_keys.issubset(input_data.keys()):
             print(f"Error: Missing required keys in input JSON. Required: {required_keys}")
             sys.exit(1)

    except json.JSONDecodeError as e:
        print(f"Error: Invalid JSON string provided - {e}")
        sys.exit(1)
    except Exception as e:
        print(f"Error parsing input data: {e}")
        sys.exit(1)

    # Make the prediction and print result to stdout
    predicted_risk = predict_risk(model, scaler, input_data)
    print(predicted_risk)