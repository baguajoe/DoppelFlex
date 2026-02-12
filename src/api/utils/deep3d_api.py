import os
import requests
from requests.exceptions import Timeout, RequestException

# 🔧 Mock version – use this while developing locally
# def send_to_deep3d(filepath):
#     """
#     Mock function to simulate sending an image to Deep3D.
#     """
#     filename = os.path.basename(filepath)
#     fake_avatar_url = f"https://mocked-deep3d.com/avatars/{filename.split('.')[0]}.glb"
#     print(f"[Mock Deep3D] Returning fake URL: {fake_avatar_url}")
#     return fake_avatar_url

# Real version to send to Deep3D API
import os
import requests
from requests.exceptions import Timeout, RequestException

# Mock version – used for development
def send_to_deep3d(filepath):
    """
    Mock function for local development. Returns a fake avatar URL.
    """
    filename = os.path.basename(filepath)
    fake_avatar_url = f"https://mocked-deep3d.com/avatars/{filename.split('.')[0]}.glb"
    print(f"[Mock Deep3D] Returning fake URL: {fake_avatar_url}")
    return fake_avatar_url

# Real version – production-ready to interact with Deep3D API
def send_to_real_deep3d(filepath):
    """
    Sends image to Deep3D API and retrieves the generated avatar URL.
    """
    api_url = "https://api.deep3d.com/generate-avatar"  # Deep3D API endpoint
    api_key = os.getenv("DEEP3D_API_KEY")  # Load API Key securely from environment variable

    try:
        # Open the image file and send it to Deep3D API
        with open(filepath, 'rb') as image_file:
            files = {'image': image_file}
            headers = {"Authorization": f"Bearer {api_key}"}  # Authorization header

            # Make a POST request to the Deep3D API
            response = requests.post(api_url, files=files, headers=headers, timeout=10)  # Timeout after 10 seconds
            response.raise_for_status()  # Raise an error if response status is not OK

            # Parse the JSON response and extract the avatar URL
            data = response.json()
            avatar_url = data.get("avatar_url")

            if avatar_url:
                return avatar_url
            else:
                print("[Deep3D Error] Avatar URL not found in response.")
                return None

    except Timeout:
        print("[Deep3D Error] The request timed out.")
        return None
    except RequestException as e:
        print(f"[Deep3D Error] Request failed: {e}")
        return None
    except Exception as e:
        print(f"[Deep3D Error] Unexpected error: {e}")
        return None

