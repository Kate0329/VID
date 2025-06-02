document.addEventListener('DOMContentLoaded', function() {
    // 定義後端 API 的基礎 URL
    const API_BASE_URL = 'https://my-yolo-app.onrender.com';
    
    const dropZone = document.getElementById('dropZone');
    const imageInput = document.getElementById('imageInput');
    const imagePreview = document.getElementById('imagePreview');
    const videoPreview = document.getElementById('videoPreview');
    const previewArea = document.getElementById('previewArea');
    const resultArea = document.getElementById('resultArea');
    const resultImage = document.getElementById('resultImage');
    const resultVideo = document.getElementById('resultVideo');
    const progressBarContainer = document.querySelector('.progress-bar-container');
    const progressBar = document.querySelector('.progress-bar');

    // 存儲當前的視頻 URL
    let currentVideoURL = null;

    // 拖放事件處理
    ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
        dropZone.addEventListener(eventName, preventDefaults, false);
    });

    function preventDefaults(e) {
        e.preventDefault();
        e.stopPropagation();
    }

    ['dragenter', 'dragover'].forEach(eventName => {
        dropZone.addEventListener(eventName, highlight, false);
    });

    ['dragleave', 'drop'].forEach(eventName => {
        dropZone.addEventListener(eventName, unhighlight, false);
    });

    function highlight(e) {
        dropZone.querySelector('.drop-zone').classList.add('dragover');
    }

    function unhighlight(e) {
        dropZone.querySelector('.drop-zone').classList.remove('dragover');
    }

    // 重新上傳按鈕
    const reuploadBtn = document.createElement('button');
    reuploadBtn.className = 'btn-reupload';
    reuploadBtn.innerHTML = '<i class="fas fa-upload me-2"></i>重新上傳';
    reuploadBtn.onclick = function() {
        resetAllStates();
    };
    previewArea.appendChild(reuploadBtn);

    function resetAllStates() {
        // 清除文件輸入
        imageInput.value = '';
        
        // 重置預覽
        imagePreview.src = '';
        videoPreview.src = '';
        imagePreview.classList.add('d-none');
        videoPreview.classList.add('d-none');
        
        // 清理之前的視頻 URL
        if (currentVideoURL) {
            URL.revokeObjectURL(currentVideoURL);
            currentVideoURL = null;
        }
        
        // 重置結果
        resultImage.src = '';
        resultVideo.src = '';
        resultImage.classList.add('d-none');
        resultVideo.classList.add('d-none');
        
        // 重置區域顯示
        dropZone.classList.remove('d-none');
        previewArea.classList.add('d-none');
        resultArea.classList.add('d-none');
        
        // 重置進度條
        progressBarContainer.style.display = 'none';
        progressBar.style.width = '0%';
        
        // 清除分析結果
        document.getElementById('basicInfoTable').innerHTML = '';
        document.getElementById('detectionsList').innerHTML = '';
    }

    // 處理拖放的文件
    dropZone.addEventListener('drop', function(e) {
        const dt = e.dataTransfer;
        const files = dt.files;

        if (files.length > 0) {
            handleFiles(files);
        }
    });

    // 處理點擊上傳
    imageInput.addEventListener('change', function() {
        if (this.files.length > 0) {
            handleFiles(this.files);
        }
    });

    function handleFiles(files) {
        const file = files[0];
        
        // 重置所有狀態
        resetAllStates();
        
        // 判斷文件類型
        if (file.type.startsWith('image/')) {
            // 處理圖片
            const reader = new FileReader();
            reader.onload = function(e) {
                imagePreview.src = e.target.result;
                imagePreview.classList.remove('d-none');
                previewArea.classList.remove('d-none');
                dropZone.classList.add('d-none');
            }
            reader.readAsDataURL(file);
        } else if (file.type.startsWith('video/') || file.name.toLowerCase().endsWith('.avi')) {
            // 處理影片
            currentVideoURL = URL.createObjectURL(file);
            videoPreview.src = currentVideoURL;
            videoPreview.classList.remove('d-none');
            previewArea.classList.remove('d-none');
            dropZone.classList.add('d-none');
            
            // 設置影片控制項
            videoPreview.controls = true;
            videoPreview.muted = false;
            
            // 監聽錯誤事件
            videoPreview.onerror = function() {
                showNotification('此影片格式可能不被您的瀏覽器支援，但系統仍會處理並轉換格式', 'warning');
            };
            
            // 嘗試播放
            videoPreview.play().catch(function(error) {
                console.log("Video playback failed:", error);
                showNotification('影片預覽可能無法播放，但不影響處理結果', 'info');
            });
        } else {
            showNotification('請上傳圖片或支援的影片格式！', 'error');
            return;
        }

        // 上傳並分析文件
        uploadAndAnalyze(file);
    }

    function uploadAndAnalyze(file) {
        const formData = new FormData();
        formData.append('file', file);

        // 顯示進度條
        progressBarContainer.style.display = 'block';
        let progress = 0;
        const progressInterval = setInterval(() => {
            if (progress < 90) {
                progress += 5;
                progressBar.style.width = progress + '%';
            }
        }, 500);

        // 添加載入狀態
        dropZone.classList.add('loading');

        fetch(`${API_BASE_URL}/upload`, {
            method: 'POST',
            body: formData
        })
        .then(response => response.json())
        .then(data => {
            clearInterval(progressInterval);
            progressBar.style.width = '100%';
            setTimeout(() => {
                progressBarContainer.style.display = 'none';
            }, 500);

            if (data.success) {
                // 更新顯示結果的邏輯，確保使用完整的 URL
                if (data.type === 'image' && data.analysis.result_image) {
                    resultImage.src = `${API_BASE_URL}/uploads/${data.analysis.result_image}`;
                } else if (data.type === 'video' && data.analysis.output_video) {
                    resultVideo.src = `${API_BASE_URL}/uploads/${data.analysis.output_video}`;
                }
                displayResults(data);
            } else {
                showNotification('錯誤：' + data.error, 'error');
            }
        })
        .catch(error => {
            clearInterval(progressInterval);
            progressBarContainer.style.display = 'none';
            console.error('Error:', error);
            showNotification('上傳過程中發生錯誤', 'error');
        })
        .finally(() => {
            dropZone.classList.remove('loading');
        });
    }

    function displayResults(data) {
        const basicInfoTable = document.getElementById('basicInfoTable');
        const detectionsList = document.getElementById('detectionsList');
        basicInfoTable.innerHTML = '';
        detectionsList.innerHTML = '';

        if (data.type === 'image') {
            // 顯示圖片分析結果
            const analysis = data.analysis;
            
            // 基本資訊
            const basicInfo = [
                ['圖片尺寸', analysis.dimensions],
                ['檔案格式', analysis.format],
                ['色彩模式', analysis.mode],
                ['平均色彩值', analysis.mean_values.map(value => Math.round(value)).join(', ')]
            ];

            basicInfo.forEach(([label, value]) => {
                const row = document.createElement('tr');
                row.innerHTML = `
                    <td><strong>${label}</strong></td>
                    <td>${value}</td>
                `;
                basicInfoTable.appendChild(row);
            });

            // 顯示標註後的圖片
            resultImage.classList.remove('d-none');
            resultVideo.classList.add('d-none');
        } else if (data.type === 'video') {
            // 顯示影片分析結果
            const analysis = data.analysis;
            
            // 基本資訊
            const basicInfo = [
                ['影片尺寸', `${analysis.width}x${analysis.height}`],
                ['總幀數', analysis.total_frames],
                ['幀率', analysis.fps],
                ['處理時間', `${Math.round(analysis.total_frames / analysis.fps)}秒`]
            ];

            basicInfo.forEach(([label, value]) => {
                const row = document.createElement('tr');
                row.innerHTML = `
                    <td><strong>${label}</strong></td>
                    <td>${value}</td>
                `;
                basicInfoTable.appendChild(row);
            });

            // 顯示處理後的影片
            resultVideo.classList.remove('d-none');
            resultImage.classList.add('d-none');
        }

        // 顯示檢測結果
        if (data.analysis.detections && data.analysis.detections.length > 0) {
            const detectionCounts = {};
            data.analysis.detections.forEach(detection => {
                const className = detection.class;
                detectionCounts[className] = (detectionCounts[className] || 0) + 1;
            });

            Object.entries(detectionCounts).forEach(([className, count]) => {
                const detectionItem = document.createElement('div');
                detectionItem.className = 'detection-item';
                detectionItem.innerHTML = `
                    <div>
                        <i class="fas fa-tag me-2"></i>${className}
                    </div>
                    <span class="confidence-badge">
                        ${count} 次檢測
                    </span>
                `;
                detectionsList.appendChild(detectionItem);
            });
        } else {
            const noDetection = document.createElement('div');
            noDetection.className = 'detection-item';
            noDetection.innerHTML = `
                <div>
                    <i class="fas fa-info-circle me-2"></i>未檢測到物件
                </div>
            `;
            detectionsList.appendChild(noDetection);
        }

        resultArea.classList.remove('d-none');
    }

    function showNotification(message, type) {
        const notification = document.createElement('div');
        notification.className = `notification ${type}`;
        let icon = 'info-circle';
        switch(type) {
            case 'error':
                icon = 'exclamation-circle';
                break;
            case 'warning':
                icon = 'exclamation-triangle';
                break;
            case 'success':
                icon = 'check-circle';
                break;
        }
        notification.innerHTML = `
            <i class="fas fa-${icon} me-2"></i>
            ${message}
        `;
        document.body.appendChild(notification);

        setTimeout(() => {
            notification.remove();
        }, 5000);
    }
}); 
