from flask import Flask, render_template, request, jsonify, send_from_directory, Response
import os
from PIL import Image
import numpy as np
import cv2
from ultralytics import YOLO
import torch
from datetime import datetime

app = Flask(__name__)

# 設定上傳文件夾
UPLOAD_FOLDER = 'uploads'
if not os.path.exists(UPLOAD_FOLDER):
    os.makedirs(UPLOAD_FOLDER)

app.config['UPLOAD_FOLDER'] = UPLOAD_FOLDER
app.config['MAX_CONTENT_LENGTH'] = 100 * 1024 * 1024  # 100MB max-limit

# 初始化 YOLO 模型
model = YOLO('yolov8n.pt')

def clean_result_image():
    """清理舊的 result.jpg"""
    result_path = os.path.join(app.config['UPLOAD_FOLDER'], 'result.jpg')
    if os.path.exists(result_path):
        try:
            os.remove(result_path)
        except Exception as e:
            print(f"Error removing result.jpg: {e}")

def process_video(video_path):
    """
    處理影片並進行物件檢測
    """
    # 獲取當前時間作為輸出文件名
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    output_path = os.path.join(app.config['UPLOAD_FOLDER'], f'output_{timestamp}.mp4')
    
    # 開啟影片
    cap = cv2.VideoCapture(video_path)
    if not cap.isOpened():
        raise ValueError("無法開啟影片文件")

    # 獲取影片資訊
    width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
    height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
    fps = int(cap.get(cv2.CAP_PROP_FPS))
    total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))

    # 設定輸出影片編碼器
    fourcc = cv2.VideoWriter_fourcc(*'avc1')  # 使用 H.264 編碼
    out = cv2.VideoWriter(output_path, fourcc, fps, (width, height))

    frame_count = 0
    detections_info = []

    while cap.isOpened():
        ret, frame = cap.read()
        if not ret:
            break

        # 每隔幾幀進行檢測，可以提高處理速度
        if frame_count % 3 == 0:
            # 進行物件檢測
            results = model(frame)
            
            # 處理檢測結果
            for result in results:
                # 在影片上繪製檢測結果
                annotated_frame = result.plot()
                
                # 收集檢測資訊
                frame_detections = []
                for box in result.boxes:
                    class_id = int(box.cls[0])
                    class_name = result.names[class_id]
                    confidence = float(box.conf[0])
                    
                    frame_detections.append({
                        'frame': frame_count,
                        'class': class_name,
                        'confidence': round(confidence * 100, 2)
                    })
                
                detections_info.extend(frame_detections)
                
                # 寫入輸出影片
                out.write(annotated_frame)
        else:
            # 非檢測幀直接寫入
            out.write(frame)

        frame_count += 1

    # 釋放資源
    cap.release()
    out.release()

    # 轉換輸出影片為 web 可播放格式
    web_output_path = os.path.join(app.config['UPLOAD_FOLDER'], f'web_output_{timestamp}.mp4')
    try:
        import subprocess
        # 使用 ffmpeg 轉換影片格式
        command = [
            'ffmpeg', '-i', output_path,
            '-c:v', 'libx264', '-preset', 'fast',
            '-c:a', 'aac',
            '-movflags', '+faststart',
            web_output_path
        ]
        subprocess.run(command, check=True)
        # 如果轉換成功，使用新的檔案路徑
        output_path = web_output_path
    except Exception as e:
        print(f"轉換影片格式時發生錯誤: {e}")
        # 如果轉換失敗，保持原始輸出

    return {
        'output_video': os.path.basename(output_path),
        'total_frames': total_frames,
        'fps': fps,
        'width': width,
        'height': height,
        'detections': detections_info
    }

def analyze_image(image_path):
    """
    分析圖片的基本資訊和進行深度學習分析
    """
    with Image.open(image_path) as img:
        # 基本資訊
        width, height = img.size
        format_type = img.format
        mode = img.mode
        
        # 計算基本統計資訊
        img_array = np.array(img)
        if len(img_array.shape) == 3:
            mean_rgb = np.mean(img_array, axis=(0,1))
            mean_rgb = [float(x) for x in mean_rgb]
        else:
            mean_rgb = [float(np.mean(img_array))]

        # 執行物件檢測
        results = model(image_path)
        detections = []
        
        # 處理檢測結果
        for result in results:
            boxes = result.boxes
            for box in boxes:
                x1, y1, x2, y2 = box.xyxy[0].tolist()
                confidence = float(box.conf[0])
                class_id = int(box.cls[0])
                class_name = result.names[class_id]
                
                detection = {
                    'class': class_name,
                    'confidence': round(confidence * 100, 2),
                    'bbox': {
                        'x1': round(x1),
                        'y1': round(y1),
                        'x2': round(x2),
                        'y2': round(y2)
                    }
                }
                detections.append(detection)

        # 保存標註後的圖片
        result_image = results[0].plot()
        cv2.imwrite(os.path.join(app.config['UPLOAD_FOLDER'], 'result.jpg'), 
                   cv2.cvtColor(result_image, cv2.COLOR_RGB2BGR))

        return {
            'dimensions': f'{width}x{height}',
            'format': format_type,
            'mode': mode,
            'mean_values': mean_rgb,
            'detections': detections,
            'result_image': 'result.jpg'
        }

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/upload', methods=['POST'])
def upload_file():
    if 'file' not in request.files:
        return jsonify({'error': '沒有檔案'}), 400
    
    file = request.files['file']
    if file.filename == '':
        return jsonify({'error': '沒有選擇檔案'}), 400
    
    if file:
        # 清理舊的 result.jpg
        clean_result_image()
        
        filename = os.path.join(app.config['UPLOAD_FOLDER'], file.filename)
        file.save(filename)
        
        try:
            # 檢查文件類型
            if file.filename.lower().endswith(('.mp4', '.avi', '.mov')):
                # 處理影片
                result = process_video(filename)
                return jsonify({
                    'success': True,
                    'type': 'video',
                    'filename': file.filename,
                    'analysis': result
                })
            else:
                # 處理圖片
                result = analyze_image(filename)
                return jsonify({
                    'success': True,
                    'type': 'image',
                    'filename': file.filename,
                    'analysis': result
                })
        except Exception as e:
            return jsonify({'error': str(e)}), 500

@app.route('/uploads/<filename>')
def uploaded_file(filename):
    return send_from_directory(app.config['UPLOAD_FOLDER'], filename)

if __name__ == '__main__':
    app.run(debug=True) 