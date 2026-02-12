# /workspaces/kiosk/src/utils/video.py

import os
from moviepy.editor import VideoFileClip  # ✅ Make sure this is uncommented
from PIL import Image  # For saving frames

def generate_frame_images(video_path, output_folder="static/frames"):
    """
    Extract frames from the given video file and save them as images.
    
    :param video_path: Path to the video file
    :param output_folder: Folder to save the generated frames
    :return: List of paths to the saved frame images
    """
    # Ensure the output folder exists
    os.makedirs(output_folder, exist_ok=True)
    
    # Load the video
    video = VideoFileClip(video_path)
    
    # Get the duration of the video in seconds
    duration = video.duration
    
    # List to store paths to frame images
    frame_paths = []
    
    # Generate frames for every second
    for t in range(int(duration)):
        # Create the filename for the frame
        frame_filename = f"frame_{t}.png"
        frame_path = os.path.join(output_folder, frame_filename)
        
        # Extract the frame at the current second (t)
        frame = video.get_frame(t)
        
        # Save the frame as an image
        frame_image = Image.fromarray(frame)
        frame_image.save(frame_path)
        
        # Add the path to the list
        frame_paths.append(frame_path)
    
    # Close the video clip
    video.close()
    
    # Return the list of frame paths
    return frame_paths
