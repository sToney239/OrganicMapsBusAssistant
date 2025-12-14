// 全局变量
var startLocation = null;
var endLocation = null;
var currentCity = '';
var startAuto = null;
var endAuto = null;
var startPlaceSearch = null;
var endPlaceSearch = null;
var cityData = []; // 存储城市编码数据
var currentCityCode = ''; // 当前选择的城市的编码

// 加载时恢复上一次的城市选择
window.addEventListener('DOMContentLoaded', function () {
    // 初始化城市数据
    initializeCityData();

    var savedCity = localStorage.getItem('selectedCity');
    if (savedCity) {
        document.getElementById('cityinput').value = savedCity;
        currentCity = savedCity;
        // 设置当前城市编码
        updateCurrentCityCode(savedCity);
    }

    // 不恢复上一次的起点和终点，保持空白

    // 设置默认出发时间为当前时间
    setDefaultDepartureTime();

    // 设置自动完成
    setupAutocomplete();

    // 设置城市输入自动完成
    setupCityAutocomplete();
});

// 设置默认出发时间
function setDefaultDepartureTime() {
    // 不设置默认时间，让用户自己选择
    // 如果用户没有输入时间，将使用当前时间进行路线规划
    document.getElementById('departuretime').value = '';
}

// 智能转换时间格式
function parseTimeInput(input) {
    input = input.trim();
    if (!input) return null;

    // 处理纯数字（如：8、15、23）
    if (/^\d+$/.test(input)) {
        var hour = parseInt(input);
        if (hour >= 0 && hour <= 23) {
            return hour + ':00';
        }
    }

    // 处理小时:分钟格式（如：8:30、14:30、8:3）
    if (/^\d{1,2}:\d{1,2}$/.test(input)) {
        var parts = input.split(':');
        var hour = parseInt(parts[0]);
        var minute = parseInt(parts[1]);

        if (hour >= 0 && hour <= 23 && minute >= 0 && minute <= 59) {
            return hour + ':' + (minute < 10 ? '0' + minute : minute);
        }
    }

    // 处理带冒号的三位数（如：8:3 转换为 8:30）
    if (/^\d{1,2}:\d$/.test(input)) {
        var parts = input.split(':');
        var hour = parseInt(parts[0]);
        var minute = parseInt(parts[1]) * 10; // 将个位数转换为整十分钟

        if (hour >= 0 && hour <= 23 && minute <= 50) {
            return hour + ':' + (minute < 10 ? '0' + minute : minute);
        }
    }

    return null; // 无效格式
}

// 获取出发时间戳（用于API调用）
function getDepartureTimestamp() {
    var timeInput = document.getElementById('departuretime').value;
    var parsedTime = parseTimeInput(timeInput);

    if (!parsedTime) {
        return null; // 使用API默认（当前时间）
    }

    var now = new Date();
    var parts = parsedTime.split(':');
    var departureDate = new Date();
    departureDate.setHours(parseInt(parts[0]), parseInt(parts[1]), 0, 0);

    // 如果设定的时间已经过去，设置为明天
    if (departureDate.getTime() < now.getTime()) {
        departureDate.setDate(departureDate.getDate() + 1);
    }

    return Math.floor(departureDate.getTime() / 1000); // 转换为秒时间戳
}

// 格式化用户输入的时间为显示格式
function formatTimeForDisplay(timestamp) {
    if (!timestamp) return '现在出发';

    var date = new Date(timestamp * 1000);
    var now = new Date();
    var today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    var targetDate = new Date(date.getFullYear(), date.getMonth(), date.getDate());

    var hours = date.getHours();
    var minutes = date.getMinutes();
    var timeString = hours + ':' + (minutes < 10 ? '0' + minutes : minutes);

    if (targetDate.getTime() === today.getTime()) {
        return '今天 ' + timeString;
    } else if (targetDate.getTime() === today.getTime() + 24 * 60 * 60 * 1000) {
        return '明天 ' + timeString;
    } else {
        return date.getMonth() + 1 + '月' + date.getDate() + '日 ' + timeString;
    }
}
//格式化json返回的时间信息
function formatTime(input) {
    // Ensure the input is a string
    const timeString = input.toString();

    // Pad with leading zeros if necessary and slice the string
    const hours = timeString.slice(0, -2).padStart(2, '0');
    const minutes = timeString.slice(-2).padEnd(2, '0');

    // Return the formatted time
    return `${hours}:${minutes}`;
}
// 设置自动完成
function setupAutocomplete() {
    var city = getCurrentCity();

    // 如果PlaceSearch服务不存在，则创建新的；否则只更新城市设置
    if (!startPlaceSearch) {
        startPlaceSearch = new AMap.PlaceSearch({
            city: city,
            pageSize: 5
        });
    } else {
        startPlaceSearch.setCity(city);
    }

    if (!endPlaceSearch) {
        endPlaceSearch = new AMap.PlaceSearch({
            city: city,
            pageSize: 5
        });
    } else {
        endPlaceSearch.setCity(city);
    }

    // 设置输入提示（如果还没有设置过）
    if (!document.getElementById('startinput').hasAttribute('data-suggestion-setup')) {
        setupInputSuggestion('startinput', startPlaceSearch, function (location) {
            startLocation = location;
        });
        document.getElementById('startinput').setAttribute('data-suggestion-setup', 'true');
    }

    if (!document.getElementById('endinput').hasAttribute('data-suggestion-setup')) {
        setupInputSuggestion('endinput', endPlaceSearch, function (location) {
            endLocation = location;
        });
        document.getElementById('endinput').setAttribute('data-suggestion-setup', 'true');
    }
}

// 设置输入提示功能
function setupInputSuggestion(inputId, placeSearch, onLocationSet) {
    var inputElement = document.getElementById(inputId);
    var suggestionDiv = null;
    var currentSuggestions = [];
    var selectedIndex = -1;

    // 创建建议下拉框
    function createSuggestionDiv() {
        if (suggestionDiv) {
            suggestionDiv.remove();
        }

        suggestionDiv = document.createElement('div');
        suggestionDiv.className = 'amap-sug-result';
        suggestionDiv.style.display = 'none';
        inputElement.parentNode.appendChild(suggestionDiv);
    }

    // 显示建议
    function showSuggestions(suggestions) {
        createSuggestionDiv();
        currentSuggestions = suggestions;
        selectedIndex = -1;

        suggestionDiv.innerHTML = '';
        suggestions.forEach(function (item, index) {
            var div = document.createElement('div');
            div.className = 'auto-item';
            div.textContent = item.name + ' - ' + item.address;
            div.addEventListener('click', function () {
                inputElement.value = item.name + ' - ' + item.address;
                if (item.location) {
                    onLocationSet(item.location);

                }
                hideSuggestions();
            });
            suggestionDiv.appendChild(div);
        });

        suggestionDiv.style.display = suggestions.length > 0 ? 'block' : 'none';
    }

    // 隐藏建议
    function hideSuggestions() {
        if (suggestionDiv) {
            suggestionDiv.style.display = 'none';
        }
    }

    // 搜索建议
    function searchSuggestions(keyword) {
        if (keyword.length < 2) {
            hideSuggestions();
            return;
        }

        placeSearch.search(keyword, function (status, result) {
            if (status === 'complete' && result.poiList && result.poiList.pois.length > 0) {
                showSuggestions(result.poiList.pois);
            } else {
                hideSuggestions();
            }
        });
    }

    // 键盘事件处理
    inputElement.addEventListener('input', function (e) {
        var keyword = e.target.value.trim();
        searchSuggestions(keyword);
    });

    inputElement.addEventListener('keydown', function (e) {
        if (!currentSuggestions.length) return;

        var items = suggestionDiv.querySelectorAll('.auto-item');

        if (e.key === 'ArrowDown') {
            e.preventDefault();
            selectedIndex = Math.min(selectedIndex + 1, currentSuggestions.length - 1);
            updateSelection(items);
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            selectedIndex = Math.max(selectedIndex - 1, -1);
            updateSelection(items);
        } else if (e.key === 'Enter') {
            e.preventDefault();
            if (selectedIndex >= 0) {
                items[selectedIndex].click();
            } else {
                hideSuggestions();
            }
        } else if (e.key === 'Escape') {
            hideSuggestions();
        }
    });

    // 更新选中状态
    function updateSelection(items) {
        items.forEach(function (item, index) {
            if (index === selectedIndex) {
                item.style.backgroundColor = '#3c3c3c';
            } else {
                item.style.backgroundColor = 'transparent';
            }
        });
    }

    // 点击其他地方隐藏建议
    document.addEventListener('click', function (e) {
        if (!inputElement.contains(e.target) && (!suggestionDiv || !suggestionDiv.contains(e.target))) {
            hideSuggestions();
        }
    });
}

// 点击页面其他地方关闭所有下拉菜单
document.addEventListener('click', function (e) {
    if (!e.target.closest('.autocomplete-container')) {
        ['time-dropdown', 'policy-dropdown', 'start-dropdown', 'end-dropdown'].forEach(function (id) {
            document.getElementById(id).classList.remove('show');
        });
    }
});


// 保存城市选择
function saveCity(city) {
    if (city && city.trim()) {
        localStorage.setItem('selectedCity', city.trim());
        currentCity = city.trim();
        // 更新当前城市编码
        updateCurrentCityCode(city.trim());
        // 重新设置自动完成的城市
        setupAutocomplete();

        // 如果设置弹窗是打开的，也要更新设置页面的自动完成
        var modal = document.getElementById('settings-modal');
        if (modal && modal.classList.contains('show')) {
            setupSettingsAutocomplete();
        }
    }
}

// 不再保存起点和终点到localStorage
function saveStartEnd() {
    // 空函数，不再保存起点和终点
}

// 清除输入框内容
function clearInput(inputId) {
    var input = document.getElementById(inputId);
    input.value = '';

    // 清除对应的位置变量
    if (inputId === 'startinput') {
        startLocation = null;
    } else if (inputId === 'endinput') {
        endLocation = null;
    }

    // 隐藏自动完成建议
    hideAllSuggestions();

    // 保存到本地存储
    saveStartEnd();

    // 让输入框获得焦点
    input.focus();
}

// 清除出发时间
function clearDepartureTime() {
    var timeInput = document.getElementById('departuretime');
    timeInput.value = '';
    timeInput.focus();
}

// 切换时间下拉菜单
function toggleTimeDropdown() {
    var dropdown = document.getElementById('time-dropdown');
    dropdown.classList.toggle('show');

    // 关闭其他下拉菜单
    ['start-dropdown', 'end-dropdown', 'policy-dropdown'].forEach(function (id) {
        document.getElementById(id).classList.remove('show');
    });
}

// 快速选择时间
function selectQuickTime(type) {
    var timeInput = document.getElementById('departuretime');
    var now = new Date();
    var timeString = '';

    switch (type) {
        case 'now':
            timeString = now.getHours() + ':' + (now.getMinutes() < 10 ? '0' + now.getMinutes() : now.getMinutes());
            break;
        case 'morning':
            timeString = '8:00';
            break;
        case 'noon':
            timeString = '12:00';
            break;
        case 'evening':
            timeString = '18:00';
            break;
        case 'night':
            timeString = '22:00';
            break;
    }

    timeInput.value = timeString;
    document.getElementById('time-dropdown').classList.remove('show');
    timeInput.focus();
}

// 切换路线选择依据下拉菜单
function togglePolicyDropdown() {
    var dropdown = document.getElementById('policy-dropdown');
    dropdown.classList.toggle('show');

    // 关闭其他下拉菜单
    ['time-dropdown', 'start-dropdown', 'end-dropdown'].forEach(function (id) {
        document.getElementById(id).classList.remove('show');
    });
}

// 选择路线选择依据
function selectPolicy(value, text) {
    var policyInput = document.getElementById('policy-select');
    policyInput.value = text;
    policyInput.setAttribute('data-value', value);
    document.getElementById('policy-dropdown').classList.remove('show');
}

// 获取当前选择的路线选择依据值
function getPolicyValue() {
    var policyInput = document.getElementById('policy-select');
    var value = policyInput.getAttribute('data-value');
    return value || '0'; // 默认使用推荐策略
}

// 隐藏所有建议下拉框
function hideAllSuggestions() {
    var suggestions = document.querySelectorAll('.amap-sug-result');
    suggestions.forEach(function (suggestion) {
        suggestion.style.display = 'none';
    });
}

// 打开设置弹窗
function openSettings() {
    var modal = document.getElementById('settings-modal');
    modal.classList.add('show');

    // 加载已保存的设置
    loadSettings();

    // 设置自动完成功能
    setupSettingsAutocomplete();
}

// 关闭设置弹窗
function closeSettings() {
    var modal = document.getElementById('settings-modal');
    modal.classList.remove('show');
}

// 清除设置输入框
function clearSettingInput(inputId) {
    var input = document.getElementById(inputId);
    input.value = '';
    input.focus();
}

// 加载设置
function loadSettings() {
    var homeAddress = localStorage.getItem('homeAddress');
    var companyAddress = localStorage.getItem('companyAddress');
    var favoriteAddress = localStorage.getItem('favoriteAddress');

    if (homeAddress) {
        document.getElementById('home-input').value = homeAddress;
    }
    if (companyAddress) {
        document.getElementById('company-input').value = companyAddress;
    }
    if (favoriteAddress) {
        document.getElementById('favorite-input').value = favoriteAddress;
    }
}

// 保存设置
function saveSettings() {
    var homeAddress = document.getElementById('home-input').value.trim();
    var companyAddress = document.getElementById('company-input').value.trim();
    var favoriteAddress = document.getElementById('favorite-input').value.trim();

    if (homeAddress) {
        localStorage.setItem('homeAddress', homeAddress);
    } else {
        localStorage.removeItem('homeAddress');
    }

    if (companyAddress) {
        localStorage.setItem('companyAddress', companyAddress);
    } else {
        localStorage.removeItem('companyAddress');
    }

    if (favoriteAddress) {
        localStorage.setItem('favoriteAddress', favoriteAddress);
    } else {
        localStorage.removeItem('favoriteAddress');
    }

    // 关闭弹窗
    closeSettings();
}

// 切换下拉菜单显示状态
function toggleDropdown(type) {
    var dropdownId = type + '-dropdown';
    var dropdown = document.getElementById(dropdownId);

    // 关闭所有其他下拉菜单
    ['start-dropdown', 'end-dropdown', 'time-dropdown', 'policy-dropdown'].forEach(function (id) {
        if (id !== dropdownId) {
            document.getElementById(id).classList.remove('show');
        }
    });

    // 切换当前下拉菜单
    dropdown.classList.toggle('show');

    // 如果是显示状态，加载历史记录
    if (dropdown.classList.contains('show')) {
        loadSearchHistory(type);
    }
}

// 从下拉菜单选择地址
function selectFromDropdown(type, itemType) {
    var address = '';
    var addressName = '';

    switch (itemType) {
        case 'home':
            address = localStorage.getItem('homeAddress');
            addressName = '家';
            break;
        case 'company':
            address = localStorage.getItem('companyAddress');
            addressName = '公司';
            break;
        case 'favorite':
            address = localStorage.getItem('favoriteAddress');
            addressName = '收藏';
            break;
    }

    if (address) {
        document.getElementById(type + 'input').value = address;
        // 触发地点搜索以获取坐标
        searchLocationForSetPoint(address, type);
        saveStartEnd();

        // 不添加常用地址到历史记录
        // addToSearchHistory(address, addressName);

        // 关闭下拉菜单
        document.getElementById(type + '-dropdown').classList.remove('show');
    } else {
        showMessage('请先在设置中添加' + addressName + '地址');
    }
}

// 加载搜索历史记录
function loadSearchHistory(type) {
    var historyKey = type + 'History';
    var history = JSON.parse(localStorage.getItem(historyKey) || '[]');
    var historyContainer = document.getElementById(type + '-history');

    historyContainer.innerHTML = '';

    if (history.length === 0) {
        var emptyItem = document.createElement('div');
        emptyItem.className = 'dropdown-item';
        emptyItem.textContent = '暂无历史记录';
        emptyItem.style.cursor = 'default';
        emptyItem.style.color = '#858585';
        historyContainer.appendChild(emptyItem);
    } else {
        history.forEach(function (item, index) {
            var historyItem = document.createElement('div');
            historyItem.className = 'dropdown-item';
            historyItem.textContent = item.name;
            historyItem.onclick = function () {
                selectHistoryItem(type, item);
            };
            historyContainer.appendChild(historyItem);
        });
    }
}

// 从历史记录选择
function selectHistoryItem(type, item) {
    document.getElementById(type + 'input').value = item.address;
    // 触发地点搜索以获取坐标
    searchLocationForSetPoint(item.address, type);
    saveStartEnd();

    // 更新历史记录（把选中的移到最前面）
    updateSearchHistory(item.address, item.name, type);

    // 关闭下拉菜单
    document.getElementById(type + '-dropdown').classList.remove('show');
}

// 添加到搜索历史记录
function addToSearchHistory(address, name) {
    ['start', 'end'].forEach(function (type) {
        updateSearchHistory(address, name, type);
    });
}

// 检查是否为常用地址
function isCommonAddress(address) {
    var homeAddress = localStorage.getItem('homeAddress');
    var companyAddress = localStorage.getItem('companyAddress');
    var favoriteAddress = localStorage.getItem('favoriteAddress');

    return address === homeAddress || address === companyAddress || address === favoriteAddress;
}

// 更新搜索历史记录
function updateSearchHistory(address, name, type) {
    // 不将常用地址添加到历史记录
    if (isCommonAddress(address)) {
        return;
    }

    var historyKey = type + 'History';
    var history = JSON.parse(localStorage.getItem(historyKey) || '[]');

    // 检查是否已存在相同地址
    var existingIndex = history.findIndex(function (item) {
        return item.address === address;
    });

    if (existingIndex !== -1) {
        // 移除已存在的项
        history.splice(existingIndex, 1);
    }

    // 添加到最前面
    history.unshift({
        address: address,
        name: name,
        timestamp: Date.now()
    });

    // 只保留最近5条记录
    history = history.slice(0, 5);

    // 保存到本地存储
    localStorage.setItem(historyKey, JSON.stringify(history));
}

// 点击页面其他地方关闭下拉菜单
document.addEventListener('click', function (e) {
    if (!e.target.matches('.autocomplete-dropdown') && !e.target.closest('.dropdown-menu')) {
        ['start-dropdown', 'end-dropdown', 'time-dropdown'].forEach(function (id) {
            document.getElementById(id).classList.remove('show');
        });
    }
});

// 为设置点搜索位置
function searchLocationForSetPoint(address, type, callback) {
    var city = getCurrentCity();
    var placeSearch = type === 'start' ? startPlaceSearch : endPlaceSearch;

    if (placeSearch) {
        placeSearch.setCity(city);
        placeSearch.search(address, function (status, result) {
            if (status === 'complete' && result.poiList && result.poiList.pois.length > 0) {
                var poi = result.poiList.pois[0];
                if (poi.location) {
                    if (type === 'start') {
                        startLocation = poi.location;
                    } else {
                        endLocation = poi.location;
                    }
                    // 如果有回调函数，执行回调
                    if (callback) {
                        callback();
                    }
                } else {
                    showMessage('未找到该地址的位置信息');
                }
            } else {
                showMessage('搜索地址失败，请检查地址是否正确');
            }
        });
    }
}

// 显示消息
function showMessage(message) {
    // 创建临时消息提示
    var messageDiv = document.createElement('div');
    messageDiv.style.cssText = `
                position: fixed;
                top: 50%;
                left: 50%;
                transform: translate(-50%, -50%);
                background-color: #2d1b1b;
                color: #f48771;
                padding: 15px 20px;
                border-radius: 4px;
                border: 1px solid #8c2d2d;
                z-index: 3000;
                font-size: 14px;
                font-family: Arial, sans-serif, 'Courier New', monospace;
            `;
    messageDiv.textContent = message;
    document.body.appendChild(messageDiv);

    // 3秒后移除
    setTimeout(function () {
        if (messageDiv.parentNode) {
            messageDiv.parentNode.removeChild(messageDiv);
        }
    }, 3000);
}

// 设置弹窗的自动完成功能
function setupSettingsAutocomplete() {
    var city = getCurrentCity();

    // 创建地点搜索服务
    if (!window.settingsPlaceSearch) {
        window.settingsPlaceSearch = new AMap.PlaceSearch({
            city: city,
            pageSize: 5
        });
    }

    // 为每个设置输入框设置自动完成
    setupInputSuggestion('home-input', window.settingsPlaceSearch, function (location) {
        // 设置页面不需要保存坐标，只需要保存地址文本
    });

    setupInputSuggestion('company-input', window.settingsPlaceSearch, function (location) {
        // 设置页面不需要保存坐标，只需要保存地址文本
    });

    setupInputSuggestion('favorite-input', window.settingsPlaceSearch, function (location) {
        // 设置页面不需要保存坐标，只需要保存地址文本
    });
}

// 点击弹窗背景关闭
document.getElementById('settings-modal').addEventListener('click', function (e) {
    if (e.target === this) {
        closeSettings();
    }
});

// 交换起点和终点
function swapStartEnd() {
    var startInput = document.getElementById('startinput');
    var endInput = document.getElementById('endinput');
    var startValue = startInput.value;
    var endValue = endInput.value;

    // 交换值
    startInput.value = endValue;
    endInput.value = startValue;

    // 交换位置变量
    var tempLocation = startLocation;
    startLocation = endLocation;
    endLocation = tempLocation;

    // 保存到本地存储
    saveStartEnd();

    // 重新获取位置信息
    if (startValue) {
        searchLocationForSetPoint(startValue, 'end');
    }
    if (endValue) {
        searchLocationForSetPoint(endValue, 'start');
    }
}

// 定位到终点
function locateTarget() {
    var endInput = document.getElementById('endinput');

    // 检查终点输入框是否有内容
    if (!endInput.value.trim()) {
        showMessage('请先输入终点地址');
        return;
    }

    // 检查是否有终点位置信息
    if (!endLocation) {
        showMessage('正在获取终点位置信息，请稍候...');
        // 重新搜索终点位置，搜索完成后自动跳转
        searchLocationForSetPoint(endInput.value.trim(), 'end', function () {
            if (endLocation) {
                // 转换GCJ坐标到WGS坐标
                var wgsCoords = gcj2wgs_exact(endLocation.lat, endLocation.lng);

                // 生成om跳转链接
                var omLink = 'om://map?ll=' + wgsCoords.lat.toFixed(7) + ',' + wgsCoords.lng.toFixed(7);

                // 跳转到om地图
                window.location.href = omLink;
            }
        });
        return;
    }

    // 转换GCJ坐标到WGS坐标
    var wgsCoords = gcj2wgs_exact(endLocation.lat, endLocation.lng);

    // 生成om跳转链接
    var omLink = 'om://map?ll=' + wgsCoords.lat.toFixed(7) + ',' + wgsCoords.lng.toFixed(7);

    // 跳转到om地图
    window.location.href = omLink;
}

// 获取当前城市
function getCurrentCity() {
    return document.getElementById('cityinput').value.trim() || '全国';
}

// 初始化城市数据
function initializeCityData() {
    try {
        // citycode.json是一个包含JSON字符串的数组，需要先解析字符串，再解析数组
        var cityCodeString = citycode[0]; // 获取字符串
        cityData = JSON.parse(cityCodeString); // 解析字符串为数组
    } catch (error) {
        console.error('城市数据加载失败:', error);
        cityData = [];
    }
}

// 城市模糊匹配
function fuzzyMatchCity(input) {
    if (!input || input.trim() === '') {
        return null;
    }

    var inputStr = input.trim().toLowerCase();
    var bestMatch = null;
    var bestScore = 0;

    for (var i = 0; i < cityData.length; i++) {
        var city = cityData[i];
        var cityName = city.cityname;

        // 完全匹配（最高优先级）
        if (cityName === inputStr) {
            return city;
        }

        // 包含匹配
        if (cityName.indexOf(inputStr) !== -1) {
            var score = cityName.length - inputStr.length;
            if (score > bestScore) {
                bestScore = score;
                bestMatch = city;
            }
        }

        // 拼音首字母匹配（简单版本）
        var pinyinMatch = matchPinyinInitials(cityName, inputStr);
        if (pinyinMatch && pinyinMatch > bestScore) {
            bestScore = pinyinMatch;
            bestMatch = city;
        }
    }

    return bestMatch;
}

// 简单的拼音首字母匹配（支持常用城市的拼音首字母）
function matchPinyinInitials(cityName, input) {
    var pinyinMap = {
        '北京': 'bj',
        '上海': 'sh',
        '天津': 'tj',
        '重庆': 'cq',
        '广州': 'gz',
        '深圳': 'sz',
        '杭州': 'hz',
        '南京': 'nj',
        '武汉': 'wh',
        '成都': 'cd',
        '西安': 'xa',
        '苏州': 'sz',
        '青岛': 'qd',
        '大连': 'dl',
        '宁波': 'nb',
        '厦门': 'xm',
        '福州': 'fz',
        '济南': 'jn',
        '长沙': 'cs',
        '郑州': 'zz',
        '沈阳': 'sy',
        '哈尔滨': 'heb',
        '石家庄': 'sjz',
        '太原': 'ty',
        '长春': 'cc',
        '合肥': 'hf',
        '南昌': 'nc',
        '昆明': 'km',
        '南宁': 'nn',
        '贵阳': 'gy',
        '兰州': 'lz',
        '海口': 'hk',
        '银川': 'yc',
        '西宁': 'xn',
        '拉萨': 'ls',
        '乌鲁木齐': 'wlmq',
        '呼和浩特': 'hhht'
    };

    for (var city in pinyinMap) {
        if (cityName.indexOf(city) !== -1 && input === pinyinMap[city]) {
            return 100; // 高分
        }
    }

    return null;
}

// 更新当前城市编码
function updateCurrentCityCode(cityName) {
    var matchedCity = fuzzyMatchCity(cityName);
    if (matchedCity) {
        currentCityCode = matchedCity.citycode;
    } else {
        currentCityCode = '';
    }
}

// 获取当前城市编码
function getCurrentCityCode() {
    return currentCityCode;
}

// 设置城市输入自动完成
function setupCityAutocomplete() {
    var cityInput = document.getElementById('cityinput');
    var cityWrapper = cityInput.parentNode;
    var suggestionDiv = null;
    var currentSuggestions = [];
    var selectedIndex = -1;

    // 创建城市建议下拉框
    function createCitySuggestionDiv() {
        if (suggestionDiv) {
            suggestionDiv.remove();
        }

        suggestionDiv = document.createElement('div');
        suggestionDiv.className = 'amap-sug-result';
        suggestionDiv.style.display = 'none';
        suggestionDiv.style.position = 'absolute';
        suggestionDiv.style.top = '100%';
        suggestionDiv.style.left = '0';
        suggestionDiv.style.right = '0';
        suggestionDiv.style.zIndex = '1000';
        cityWrapper.appendChild(suggestionDiv);
    }

    // 显示城市建议
    function showCitySuggestions(suggestions) {
        createCitySuggestionDiv();
        currentSuggestions = suggestions;
        selectedIndex = -1;

        suggestionDiv.innerHTML = '';
        suggestions.forEach(function (item, index) {
            var div = document.createElement('div');
            div.className = 'auto-item';
            div.textContent = item.cityname;
            div.addEventListener('click', function () {
                cityInput.value = item.cityname;
                currentCity = item.cityname;
                currentCityCode = item.citycode;
                saveCity(item.cityname);
                hideCitySuggestions();
            });
            suggestionDiv.appendChild(div);
        });

        suggestionDiv.style.display = suggestions.length > 0 ? 'block' : 'none';
    }

    // 隐藏城市建议
    function hideCitySuggestions() {
        if (suggestionDiv) {
            suggestionDiv.style.display = 'none';
        }
    }

    // 搜索城市建议
    function searchCitySuggestions(keyword) {
        if (keyword.length < 1) {
            hideCitySuggestions();
            return;
        }

        var suggestions = [];
        var inputStr = keyword.toLowerCase();

        // 模糊匹配城市
        for (var i = 0; i < cityData.length; i++) {
            var city = cityData[i];
            var cityName = city.cityname;

            // 完全匹配或包含匹配
            if (cityName.indexOf(keyword) !== -1) {
                suggestions.push(city);
            }

            // 限制建议数量
            if (suggestions.length >= 5) {
                break;
            }
        }

        showCitySuggestions(suggestions);
    }

    // 键盘事件处理
    cityInput.addEventListener('input', function (e) {
        var keyword = e.target.value.trim();
        searchCitySuggestions(keyword);
    });

    cityInput.addEventListener('keydown', function (e) {
        if (!currentSuggestions.length) return;

        var items = suggestionDiv.querySelectorAll('.auto-item');

        if (e.key === 'ArrowDown') {
            e.preventDefault();
            selectedIndex = Math.min(selectedIndex + 1, currentSuggestions.length - 1);
            updateCitySelection(items);
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            selectedIndex = Math.max(selectedIndex - 1, -1);
            updateCitySelection(items);
        } else if (e.key === 'Enter') {
            e.preventDefault();
            if (selectedIndex >= 0) {
                items[selectedIndex].click();
            } else {
                hideCitySuggestions();
            }
        } else if (e.key === 'Escape') {
            hideCitySuggestions();
        }
    });

    // 更新选中状态
    function updateCitySelection(items) {
        items.forEach(function (item, index) {
            if (index === selectedIndex) {
                item.style.backgroundColor = '#3c3c3c';
            } else {
                item.style.backgroundColor = 'transparent';
            }
        });
    }

    // 点击其他地方隐藏建议
    document.addEventListener('click', function (e) {
        if (!cityInput.contains(e.target) && (!suggestionDiv || !suggestionDiv.contains(e.target))) {
            hideCitySuggestions();
        }
    });
}

// 城市输入框失去焦点时保存
document.getElementById('cityinput').addEventListener('blur', function () {
    saveCity(this.value);
});

// 城市输入框内容变化时更新自动完成城市
document.getElementById('cityinput').addEventListener('input', function () {
    var city = this.value.trim() || '全国';
    currentCity = city;
    // 更新城市编码
    updateCurrentCityCode(city);

    // 立即更新现有地点搜索服务的城市设置
    if (startPlaceSearch) {
        startPlaceSearch.setCity(city);
    }
    if (endPlaceSearch) {
        endPlaceSearch.setCity(city);
    }
    if (window.settingsPlaceSearch) {
        window.settingsPlaceSearch.setCity(city);
    }
});

// 起点和终点输入框失去焦点时保存
document.getElementById('startinput').addEventListener('blur', function () {
    saveStartEnd();
});

document.getElementById('endinput').addEventListener('blur', function () {
    saveStartEnd();
});

// 地点搜索服务
function searchLocation(keyword, city, isStart, callback) {
    var placeSearch = isStart ? startPlaceSearch : endPlaceSearch;
    placeSearch.setCity(city);
    placeSearch.search(keyword, function (status, result) {
        if (status === 'complete' && result.poiList && result.poiList.pois.length > 0) {
            var poi = result.poiList.pois[0];
            if (poi.location) {
                callback(poi.location);
            } else {
                callback(null);
            }
        } else {
            callback(null);
        }
    });
}

// 获取策略值 - Web API版本
function getPolicyValue() {
    var policyInput = document.getElementById('policy-select');
    var policyValue = policyInput.getAttribute('data-value');
    return policyValue || '0'; // 默认推荐模式
}

// 格式化时间
function formatDuration(seconds) {
    var hours = Math.floor(seconds / 3600);
    var minutes = Math.floor((seconds % 3600) / 60);

    if (hours > 0) {
        return hours + '小时' + minutes + '分';
    } else {
        return minutes + '分钟';
    }
}

// 格式化距离
function formatDistance(meters) {
    if (meters >= 1000) {
        return (meters / 1000).toFixed(1) + '公里';
    } else {
        return Math.round(meters) + '米';
    }
}

// 获取步骤图标
function getStepIcon(instruction) {
    if (instruction.indexOf('步行') >= 0 || instruction.indexOf('走路') >= 0) {
        return 'walk';
    } else if (instruction.indexOf('地铁') >= 0 || instruction.indexOf('MTR') >= 0) {
        return 'metro';
    } else {
        return 'bus';
    }
}

// 获取交通方式摘要
function getTransportSummary(segments) {
    var transportTypes = [];
    var hasWalking = false;

    segments.forEach(function (segment) {
        if (segment.transit_mode === 'WALK') {
            hasWalking = true;
        } else if (segment.transit_mode === 'SUBWAY') {
            if (!transportTypes.includes('地铁')) {
                transportTypes.push('地铁');
            }
        } else if (segment.transit_mode === 'BUS') {
            if (!transportTypes.includes('公交')) {
                transportTypes.push('公交');
            }
        }
    });

    if (hasWalking && transportTypes.length > 0) {
        transportTypes.push('步行');
    } else if (hasWalking) {
        transportTypes = ['步行'];
    }

    return transportTypes;
}

// 计算步行总距离
function getWalkingDistance(segments) {
    var walkingDistance = 0;
    segments.forEach(function (segment) {
        if (segment.transit_mode === 'WALK' && segment.distance) {
            walkingDistance += segment.distance;
        }
    });
    return walkingDistance;
}

// 获取高德API返回的实际费用
function getActualCost(route) {
    // 高德API返回的数据中，费用信息通常在route对象的某个属性中
    // 根据高德地图文档，费用信息通常在route.cost属性中
    if (route.cost !== undefined && route.cost !== null) {
        return route.cost;
    }

    // 如果route.cost不存在，尝试从segments中查找费用信息
    var totalCost = 0;
    if (route.segments && route.segments.length > 0) {
        route.segments.forEach(function (segment) {
            if (segment.cost !== undefined && segment.cost !== null) {
                totalCost += segment.cost;
            }
        });
        return totalCost > 0 ? totalCost : null;
    }

    // 如果都没有找到费用信息，返回null
    return null;
}

// 检查是否为站内换乘（步行前后都是地铁，且前一个地铁没有出站口）
function checkStationTransfer(allSegments, currentIndex) {
    // 如果是第一个或最后一个步行路段，不可能是站内换乘
    if (currentIndex === 0 || currentIndex === allSegments.length - 1) {
        return false;
    }

    var prevSegment = allSegments[currentIndex - 1];
    var nextSegment = allSegments[currentIndex + 1];

    // 严格检查前一个路段是否为地铁（只根据transit_mode判断）
    var prevIsSubway = prevSegment && prevSegment.transit_mode === 'SUBWAY';

    // 严格检查后一个路段是否为地铁（只根据transit_mode判断）
    var nextIsSubway = nextSegment && nextSegment.transit_mode === 'SUBWAY';

    // 检查前一个地铁路段是否有出站口信息（只根据transit.exit属性判断）
    var prevHasExit = false;
    if (prevIsSubway && prevSegment && prevSegment.transit && prevSegment.transit.exit && prevSegment.transit.exit.name) {
        prevHasExit = true;
    }

    // 只有当前后都是地铁且前一个地铁没有出站口时，才是站内换乘
    return prevIsSubway && nextIsSubway && !prevHasExit;
}

// 格式化公交路段的显示内容
function formatBusInstruction(segment) {
    try {
        var busInfo = {
            line: '',          // 公交线路
            direction: '',     // 方向
            stations: '',      // 乘坐站数
            exit: '',          // 出站口
            tips: '',
            startTime: '',
            endTime: ''
        };

        // 获取站点数据的来源
        var linesSource = null;
        
        // 优先从transit.lines获取
        if (segment.transit && segment.transit.lines && segment.transit.lines.length > 0) {
            linesSource = segment.transit.lines;
        }
        // 其次从bus.buslines获取
        else if (segment.bus && segment.bus.buslines && segment.bus.buslines.length > 0) {
            linesSource = segment.bus.buslines;
        }
        // 再其次从buslines获取
        else if (segment.buslines && segment.buslines.length > 0) {
            linesSource = segment.buslines;
        }

        // 从linesSource获取所有线路名称
        if (linesSource) {
            var lineNames = [];
            for (var i = 0; i < linesSource.length; i++) {
                var line = linesSource[i];
                if (line.name) {
                    var lineName = line.name;
                    // 去掉每个线路名称中括号内的内容
                    lineName = lineName.replace(/\([^)]*\)/g, '');
                    lineNames.push(lineName);
                }
            }
            if (lineNames.length > 0) {
                busInfo.line = lineNames.join('/');
            }
        }

        var departureStop = null;
        var arrivalStop = null;

        // 从linesSource的第一条线路获取站点信息
        if (linesSource && linesSource.length > 0) {
            var firstLine = linesSource[0];
            if (!departureStop && firstLine.departure_stop) {
                departureStop = firstLine.departure_stop;
            }
            if (!arrivalStop && firstLine.arrival_stop) {
                arrivalStop = firstLine.arrival_stop;
            }
            
        }

        // 传统数据源获取站点信息
        if (!departureStop || !arrivalStop) {
            if (segment.bus && segment.bus.buslines && segment.bus.buslines[0]) {
                if (!departureStop) departureStop = segment.bus.buslines[0].departure_stop;
                if (!arrivalStop) arrivalStop = segment.bus.buslines[0].arrival_stop;
            } else if (segment.railway && segment.railway.lines && segment.railway.lines[0]) {
                if (!departureStop) departureStop = segment.railway.lines[0].departure_stop;
                if (!arrivalStop) arrivalStop = segment.railway.lines[0].arrival_stop;
            }
        }
        if (firstLine.via_num != '0') {
            busInfo.direction = firstLine.via_stops[0].name;
        } else if (arrivalStop && arrivalStop.name) {
            busInfo.direction = arrivalStop.name;
        }

        if (linesSource[0].bus_time_tips && linesSource[0].bus_time_tips !== '') {
            busInfo.tips = linesSource[0].bus_time_tips
        }
        if (linesSource[0].start_time && linesSource[0].start_time !== '') {
            busInfo.startTime = formatTime(linesSource[0].start_time)
        }
        if (linesSource[0].end_time && linesSource[0].end_time !== '') {
            busInfo.endTime = formatTime(linesSource[0].end_time)
        }

        var result = '';
        var stationInfoHtml = '';

        // 构建站点信息行
        if (departureStop && departureStop.name) {
            var stationInfo = '上车站：' + departureStop.name;
            if (busInfo.direction) {
                stationInfo += '&nbsp;&nbsp;&nbsp;&nbsp;下一站: ' + busInfo.direction;
            }
            stationInfoHtml = '<div class="subway-stop-item final-destination" style="border-left-color: #dcdcaa;font-size: 12px;margin-top: 5px">' + stationInfo + '</div>';
        }

        // 组合最终结果
        if (busInfo.line) {
            result = "<div>"+busInfo.line + '</div>';;
        }
        if (busInfo.startTime && busInfo.endTime) {
            result += '<div style="font-size: 12px;color: #8C8C8C">运营时间：' + busInfo.startTime+' - '+ busInfo.endTime+'</div>';
        }
        if (busInfo.tips) {
            result += '<div style="font-size: 12px;color: #8C8C8C">' + busInfo.tips + '</div>';
        }
        if (stationInfoHtml) {
            result = result ? (result +  stationInfoHtml) : stationInfoHtml;
        }

        return result || segment.instruction || ''; // 如果格式化失败，返回原始指令

    } catch (error) {
        console.error('formatBusInstruction error:', error);
        return segment.instruction || ''; // 出错时返回原始指令
    }
}

// 格式化地铁路段的显示内容
function formatSubwayInstruction(segment) {
    try {
        var subwayInfo = {
            line: '',          // 地铁线路
            direction: '',     // 方向
            stations: '',      // 乘坐站数
            exit: '',          // 出站口
            tips: '',
            startTime: '',
            endTime: ''
        };

        // 获取站点数据的来源
        var linesSource = null;
        
        if (segment.transit && segment.transit.buslines && segment.transit.buslines.length > 0) {
            linesSource = segment.transit.buslines;
        }
        // 其次从bus.buslines获取
        else if (segment.bus && segment.bus.buslines && segment.bus.buslines.length > 0) {
            linesSource = segment.bus.buslines;
        }
        // 再其次从buslines获取
        else if (segment.buslines && segment.buslines.length > 0) {
            linesSource = segment.buslines;
        }

        // 从linesSource获取所有线路名称
        if (linesSource) {
            var lineNames = [];
            for (var i = 0; i < linesSource.length; i++) {
                var line = linesSource[i];
                if (line.name) {
                    var lineName = line.name;
                    // 去掉每个线路名称中括号内的内容
                    lineName = lineName.replace(/\([^)]*\)/g, '');
                    lineNames.push(lineName);
                }
            }
            if (lineNames.length > 0) {
                subwayInfo.line = lineNames.join('/');
            }
        }

        var departureStop = null;
        var arrivalStop = null;

        // 从linesSource的第一条线路获取站点信息
        if (linesSource && linesSource.length > 0) {
            var firstLine = linesSource[0];
            if (!departureStop && firstLine.departure_stop) {
                departureStop = firstLine.departure_stop;
            }
            if (!arrivalStop && firstLine.arrival_stop) {
                arrivalStop = firstLine.arrival_stop;
            }
        }

        // 传统数据源获取站点信息
        if (!departureStop || !arrivalStop) {
            if (segment.bus && segment.bus.buslines && segment.bus.buslines[0]) {
                if (!departureStop) departureStop = segment.bus.buslines[0].departure_stop;
                if (!arrivalStop) arrivalStop = segment.bus.buslines[0].arrival_stop;
            } else if (segment.bus && segment.bus.buslines && segment.bus.buslines[0]) {
                if (!departureStop) departureStop = segment.bus.buslines[0].departure_stop;
                if (!arrivalStop) arrivalStop = segment.bus.buslines[0].arrival_stop;
            }
        }
        if (firstLine.via_num != '0') {
            subwayInfo.direction = firstLine.via_stops[0].name;
        } else if (arrivalStop && arrivalStop.name) {
            subwayInfo.direction = arrivalStop.name;
        }

        
        if (linesSource[0].bus_time_tips && linesSource[0].bus_time_tips !== '') {
            subwayInfo.tips = linesSource[0].bus_time_tips
        }
        if (linesSource[0].start_time && linesSource[0].start_time !== '') {
            subwayInfo.startTime = formatTime(linesSource[0].start_time)
        } else if (linesSource[0].station_start_time && linesSource[0].station_start_time !== '') {
            subwayInfo.startTime = formatTime(linesSource[0].station_start_time)
        }
        if (linesSource[0].end_time && linesSource[0].end_time !== '') {
            subwayInfo.endTime = formatTime(linesSource[0].end_time)
        } else if (linesSource[0].station_end_time && linesSource[0].station_end_time !== '') {
            subwayInfo.endTime = formatTime(linesSource[0].station_end_time)
        }
        
        var result = '';
        var stationInfoHtml = '';

        // 构建站点信息行
        if (departureStop && departureStop.name) {
            var stationInfo = '上车站：' + departureStop.name;
            if (subwayInfo.direction) {
                stationInfo += '&nbsp;&nbsp;&nbsp;&nbsp;下一站: ' + subwayInfo.direction;
            }
            stationInfoHtml = '<div class="subway-stop-item final-destination" style="border-left-color: #dcdcaa;font-size: 12px;margin-top: 5px">' + stationInfo + '</div>';
        }

        // 组合最终结果
        if (subwayInfo.line) {
            result = "<div>"+subwayInfo.line + '</div>';;
        }
        if (subwayInfo.startTime && subwayInfo.endTime) {
            result += '<div style="font-size: 12px;color: #8C8C8C">运营时间：' + subwayInfo.startTime+' - '+ subwayInfo.endTime+'</div>';
        }
        if (subwayInfo.tips) {
            result += '<div style="font-size: 12px;color: #8C8C8C">' + subwayInfo.tips + '</div>';
        }
        if (stationInfoHtml) {
            result = result ? (result +  stationInfoHtml) : stationInfoHtml;
        }

        return result || segment.instruction || ''; // 如果格式化失败，返回原始指令

    } catch (error) {
        console.error('formatSubwayInstruction error:', error);
        return segment.instruction || ''; // 出错时返回原始指令
    }
}

// 生成步行OM链接
function generateWalkOMLink(segment) {
    // 检查是否是步行路段
    if (!segment.instruction || segment.instruction !== '步行') {
        return '';
    }

    // 从不同可能的属性获取坐标
    var startLocation = null;
    var endLocation = null;

    // 从origin获取起点坐标
    if (segment.walking && segment.walking.origin) {
        var [lng, lat] = segment.walking.origin.split(',');
        var startLocation = {
            lng: parseFloat(lng), 
            lat: parseFloat(lat)  
        };

    }
    // 从destination获取终点坐标
    if (segment.walking && segment.walking.destination) {
        var [lng1, lat1] = segment.walking.destination.split(',');
        var endLocation = {
            lng: parseFloat(lng1), 
            lat: parseFloat(lat1)  
        };
    }

    if (!startLocation || !endLocation) {

        return '';
    }



    var startGcjLat = startLocation.lat;
    var startGcjLng = startLocation.lng;
    var endGcjLat = endLocation.lat;
    var endGcjLng = endLocation.lng;



    // 检查坐标是否为有效数字
    if (isNaN(startGcjLat) || isNaN(startGcjLng) || isNaN(endGcjLat) || isNaN(endGcjLng)) {

        return '';
    }

    try {
        // 转换为WGS-84坐标
        var startWgs = gcj2wgs_exact(startGcjLat, startGcjLng);
        var endWgs = gcj2wgs_exact(endGcjLat, endGcjLng);



        // 检查转换后的坐标是否有效
        if (isNaN(startWgs.lat) || isNaN(startWgs.lng) || isNaN(endWgs.lat) || isNaN(endWgs.lng)) {

            return '';
        }

        // 构建起点和终点地址
        var saddr = '步行起点';
        var daddr = '步行终点';

        // 从instruction中提取地点信息
        var instruction = segment.instruction || '';
        if (instruction) {
            // 尝试从指令中提取地点名称
            var matches = instruction.match(/到达(.+)/);
            if (matches && matches[1]) {
                daddr = matches[1].trim();
            }
        }

        // 编码地址
        saddr = encodeURIComponent(saddr);
        daddr = encodeURIComponent(daddr);

        // 生成OM链接
        var omLink = 'om://route?sll=' + startWgs.lat.toFixed(7) + ',' + startWgs.lng.toFixed(7) +
            '&saddr=' + saddr + '&dll=' + endWgs.lat.toFixed(7) + ',' + endWgs.lng.toFixed(7) +
            '&daddr=' + daddr + '&type=pedestrian';


        return '<a href="' + omLink + '" class="om-walk-link" title="在OM中打开步行导航">导航</a>';

    } catch (error) {
        console.error('generateWalkOMLink error:');
        return '';
    }
}

// 渲染公交站点列表
function renderBusStops(segment, segmentIndex, stepIndex) {

    var uniqueId = 'bus-stops-' + segmentIndex + '-' + stepIndex;
    var stops = null;

    // 统一直接从原始bus数据获取
    if (segment.bus && segment.bus.buslines && segment.bus.buslines[0] && segment.bus.buslines[0].via_stops) {
        stops = segment.bus.buslines[0].via_stops;
    }
    // 其他备用数据源
    else if (segment.bus && segment.bus.via_stops) {
        stops = segment.bus.via_stops;
    } else if (segment.via_stops) {
        stops = segment.via_stops;
    } else if (segment.railway && segment.railway.via_stops) {
        stops = segment.railway.via_stops;
    } else if (segment.transit && segment.transit.buslines && segment.transit.lines[0] && segment.transit.lines[0].via_stops) {
        stops = segment.transit.buslines[0].via_stops;
    }
    var stopsHtml = '';

    // 安全检查：确保stops存在且是数组
    if (!stops || !Array.isArray(stops)) {
        stops = [];
    }

    // 获取上车站和下车站信息 - 统一使用transit数据
    var departureStop = null;
    var arrivalStop = null;

    // 备用数据源
    if (!departureStop || !arrivalStop) {
        if (segment.bus && segment.bus.buslines && segment.bus.buslines[0]) {
            if (!departureStop) departureStop = segment.bus.buslines[0].departure_stop;
            if (!arrivalStop) arrivalStop = segment.bus.buslines[0].arrival_stop;
        } else if (segment.railway && segment.railway.lines && segment.railway.lines[0]) {
            if (!departureStop) departureStop = segment.railway.lines[0].departure_stop;
            if (!arrivalStop) arrivalStop = segment.railway.lines[0].arrival_stop;
        }
    }

    // 添加departure_stop作为第一站（上车站）
    if (departureStop && departureStop.name) {
        var onStationName = departureStop.name;
        stopsHtml += `<div class="subway-stop-item" style="border-left-color: #dcdcaa; font-weight: bold;">${onStationName}</div>`;
    }

    // 生成站点列表
    stops.forEach(function (stop, index) {
        if (stop && stop.name) {
            var stopInfo = stop.name;            
            stopsHtml += `<div class="subway-stop-item">${stopInfo}</div>`;
        }
    });

    // 添加arrival_stop作为最后一站
    if (arrivalStop && arrivalStop.name) {
        var offStationName = arrivalStop.name;
        stopsHtml += `<div class="subway-stop-item"  style="border-left-color: #dcdcaa; font-weight: bold;">${offStationName}</div>`;
    }

    // 计算实际乘坐的站点数（从出发站到到达站）
    var totalRidingStops = stops.length; // via_stops中的站点数
    if (departureStop && departureStop.name && arrivalStop && arrivalStop.name) {
        // 如果有明确的起止站，乘坐站数 = via_stops站点数 + 1
        totalRidingStops = stops.length + 1;
    } else if (departureStop && departureStop.name && !arrivalStop) {
        // 只有出发站
        totalRidingStops = stops.length;
    } else if (!departureStop && arrivalStop && arrivalStop.name) {
        // 只有到达站
        totalRidingStops = stops.length + 1;
    }
    var viaStopsCount = Math.max(0, totalRidingStops);

    // 构建下车站信息（类似地铁的处理方式）
    var stationInfoHtml = '';
    if (arrivalStop && arrivalStop.name) {
        var offStationName = arrivalStop.name;
        stationInfoHtml += `<div class="subway-stop-item final-destination" style="border-left-color: #dcdcaa;font-size: 12px;">下车站： ${offStationName}</div>`;
    }

    return `
                <div class="subway-stops">
                    <div class="subway-stops-header" onclick="toggleBusStops('${uniqueId}')">
                        ▶ 乘坐 ${viaStopsCount} 站
                    </div>
                    <div id="${uniqueId}" class="subway-stops-list">
                        ${stopsHtml}
                    </div>
                </div>
                ${stationInfoHtml}
            `;
}

// 渲染地铁站点列表
function renderSubwayStops(segment, segmentIndex, stepIndex) {

    var uniqueId = 'subway-stops-' + segmentIndex + '-' + stepIndex;
    var stops = null;

    // 统一直接从原始bus数据获取
    if (segment.bus && segment.bus.buslines && segment.bus.buslines[0] && segment.bus.buslines[0].via_stops) {
        stops = segment.bus.buslines[0].via_stops;
    }
    // 其他备用数据源
    else if (segment.bus && segment.bus.via_stops) {
        stops = segment.bus.via_stops;
    } else if (segment.via_stops) {
        stops = segment.via_stops;
    } else if (segment.railway && segment.railway.via_stops) {
        stops = segment.railway.via_stops;
    } else if (segment.transit && segment.transit.lines && segment.transit.lines[0] && segment.transit.lines[0].via_stops) {
        stops = segment.transit.lines[0].via_stops;
    }
    var stopsHtml = '';

    // 安全检查：确保stops存在且是数组
    if (!stops || !Array.isArray(stops)) {
        stops = [];
    }

    // 获取上车站和下车站信息
    var departureStop = null;
    var arrivalStop = null;

    // 备用数据源
    if (!departureStop || !arrivalStop) {
        if (segment.bus && segment.bus.buslines && segment.bus.buslines[0]) {
            if (!departureStop) departureStop = segment.bus.buslines[0].departure_stop;
            if (!arrivalStop) arrivalStop = segment.bus.buslines[0].arrival_stop;
        } else if (segment.railway && segment.railway.lines && segment.railway.lines[0]) {
            if (!departureStop) departureStop = segment.railway.lines[0].departure_stop;
            if (!arrivalStop) arrivalStop = segment.railway.lines[0].arrival_stop;
        }
    }

    // 添加departure_stop作为第一站（上车站）
    if (departureStop && departureStop.name) {
        var onStationName = departureStop.name;
        stopsHtml += `<div class="subway-stop-item"  style="border-left-color: #dcdcaa; font-weight: bold;">${onStationName}</div>`;
    }
    
    
    // 生成站点列表
    stops.forEach(function (stop, index) {
        if (stop && stop.name) {
            var stopInfo = stop.name;
            stopsHtml += `<div class="subway-stop-item">${stopInfo}</div>`;
        }
    });

    // 添加arrival_stop作为最后一站
    if (arrivalStop && arrivalStop.name) {
        var offStationName = arrivalStop.name;
        stopsHtml += `<div class="subway-stop-item"  style="border-left-color: #dcdcaa; font-weight: bold;">${offStationName}</div>`;
    }
    // 计算实际乘坐的站点数（从出发站到到达站）
    var totalRidingStops = stops.length; // via_stops中的站点数
    if (departureStop && departureStop.name && arrivalStop && arrivalStop.name) {
        // 如果有明确的起止站，乘坐站数 = via_stops站点数 + 1
        totalRidingStops = stops.length + 1;
    } else if (departureStop && departureStop.name && !arrivalStop) {
        totalRidingStops = stops.length;
    } else if (!departureStop && arrivalStop && arrivalStop.name) {
        totalRidingStops = stops.length + 1;
    }
    var viaStopsCount = Math.max(0, totalRidingStops);

    // 构建下车站和出站口信息
    var stationInfoHtml = '';
    if (arrivalStop && arrivalStop.name) {
        var offStationName = arrivalStop.name;

        // 添加出站口信息
        var exitInfo = '';
        if (segment.bus && segment.bus.buslines && segment.bus.buslines[0] && segment.bus.buslines[0].arrival_stop && segment.bus.buslines[0].arrival_stop.exit && segment.bus.buslines[0].arrival_stop.exit.name ) {
            exitInfo = segment.bus.buslines[0].arrival_stop.exit.name;
        } else {
            // 尝试从指令中提取出站口信息
            var instruction = segment.instruction || '';
            var exitMatch = instruction.match(/([A-Z0-9]+号?出站口|[A-Z0-9]+出站口|出站口[A-Z0-9]+)/i);
            if (exitMatch) {
                exitInfo = exitMatch[1];
            }
        }
        if (exitInfo != "") {
            stationInfoHtml += `<div class="subway-stop-item final-destination" style="border-left-color: #dcdcaa;font-size: 12px;">下车站： ${offStationName}&nbsp;&nbsp;&nbsp;&nbsp;出站口: ${exitInfo}</div>`;
        } else {
            stationInfoHtml += `<div class="subway-stop-item final-destination" style="border-left-color: #dcdcaa;font-size: 12px;">下车站： ${offStationName}</div>`;
        }
    }

    return `
                <div class="subway-stops">
                    <div class="subway-stops-header" onclick="toggleSubwayStops('${uniqueId}')">
                        ▶ 乘坐 ${viaStopsCount} 站
                    </div>
                    <div id="${uniqueId}" class="subway-stops-list">
                        ${stopsHtml}
                    </div></div>
                    ${stationInfoHtml}
                
            `;
}

// 切换公交站点列表显示
function toggleBusStops(uniqueId) {
    var stopsList = document.getElementById(uniqueId);

    // 检查元素是否存在
    if (!stopsList) {
        console.warn('公交站点列表元素未找到: ' + uniqueId);
        return;
    }

    var header = stopsList.previousElementSibling;

    // 检查header是否存在
    if (!header) {
        console.warn('公交站点列表头部元素未找到');
        return;
    }

    var isExpanded = stopsList.classList.contains('expanded');
    var stopsCount = Math.max(0, stopsList.children.length - 1); // 减去起始站，显示途径站数

    if (isExpanded) {
        stopsList.classList.remove('expanded');
        header.innerHTML = '▶ 乘坐 ' + stopsCount + ' 站';
    } else {
        stopsList.classList.add('expanded');
        header.innerHTML = '▼ 乘坐 ' + stopsCount + ' 站';
    }
}

// 切换地铁站点列表显示
function toggleSubwayStops(uniqueId) {
    var stopsList = document.getElementById(uniqueId);

    // 检查元素是否存在
    if (!stopsList) {
        console.warn('地铁站点列表元素未找到: ' + uniqueId);
        return;
    }

    var header = stopsList.previousElementSibling;

    // 检查header是否存在
    if (!header) {
        console.warn('地铁站点列表头部元素未找到');
        return;
    }

    var isExpanded = stopsList.classList.contains('expanded');
    var stopsCount = Math.max(0, stopsList.children.length - 1); // 减去起始站，显示途径站数

    if (isExpanded) {
        stopsList.classList.remove('expanded');
        header.innerHTML = '▶ 乘坐 ' + stopsCount + ' 站';
    } else {
        stopsList.classList.add('expanded');
        header.innerHTML = '▼ 乘坐 ' + stopsCount + ' 站';
    }
}

// 渲染路线步骤
function renderSteps(segments, routeIndex) {
    var stepsHtml = '<div class="route-steps-content">';
    var previousStep = ''; 

    segments.forEach(function (segment, index) {
        var segmentElements = [];
        
        if (segment.walking) {
            segmentElements.push({
                type: 'WALK',
                data: segment.walking,
                original_segment: segment
            });
        }
        if (segment.bus && segment.bus.buslines[0].type !== '地铁线路') {
            segmentElements.push({
                type: 'BUS', 
                data: segment.bus,
                original_segment: segment
            });
        }
        if (segment.bus && segment.bus.buslines[0].type === '地铁线路') {
            segmentElements.push({
                type: 'RAILWAY',
                data: segment.bus,
                original_segment: segment
            });
        }

        if (segmentElements.length <= 1) {
            var elementToProcess = segmentElements.length === 1 ? segmentElements[0] : { type: segment.transit_mode || 'WALK', data: segment, original_segment: segment };
            var stepHtml = renderSingleStep(elementToProcess, index, segments, routeIndex);
            if (!areStepsSimilar(previousStep, stepHtml)) {
                stepsHtml += stepHtml;
                previousStep = stepHtml; // 保存当前步骤  
            } 
        } else {
            segmentElements.forEach(function (element, elementIndex) {
                var adjustedIndex = index + (elementIndex * 0.1);
                var stepHtml = renderSingleStep(element, adjustedIndex, segments, routeIndex);
                
                // 检查是否有连续两个相同的步骤
                if (!areStepsSimilar(previousStep, stepHtml)) {
                    stepsHtml += stepHtml;
                    previousStep = stepHtml; // 保存当前步骤  
                } 
            });
        }
    });

    stepsHtml += '</div>';
    return stepsHtml;
}

function areStepsSimilar(stepHtml1, stepHtml2) {
    // 创建一个函数用来清理HTML，移除不需要比较的部分
    function cleanStepHtml(stepHtml) {
        // 移除ID
        stepHtml = stepHtml.replace(/<div id=".*?">/, '<div id="placeholder">');
        // 移除onclick
        stepHtml = stepHtml.replace(/onclick="toggleBusStops\(.*?\)"/, 'onclick="toggleBusStops(\'placeholder\')"');
        // 移除时间部分
        stepHtml = stepHtml.replace(/时间：.*?<\/span>/, '时间：placeholder</span>');
        stepHtml = stepHtml.replace(/距离：.*?<\/span>/, '距离：placeholder</span>');
        return stepHtml;
    }

    // 清理两个stepHtml
    const cleanedStepHtml1 = cleanStepHtml(stepHtml1);
    const cleanedStepHtml2 = cleanStepHtml(stepHtml2);

    // 比较清理后的内容
    return cleanedStepHtml1 === cleanedStepHtml2;
}

// 渲染单个步骤（新函数，处理单个元素）
function renderSingleStep(element, index, segments, routeIndex) {
    var segment = element.original_segment;
    var type = element.type;
    var currentData = element.data;
    
    // 根据元素类型生成图标和文字
    var iconClass, iconText;
    if (type === 'WALK') {
        iconClass = 'walk';
        iconText = '步行';
    } else if (type === 'SUBWAY' || type === 'RAILWAY') {
        iconClass = 'metro';
        iconText = '地铁';
    } else {
        iconClass = 'bus';
        iconText = '公交';
    }

    // 从当前元素数据中获取时间和距离信息
    var durationInfo = '';
    var distanceInfo = '';
    
    if (currentData && currentData.cost && currentData.cost.duration) {
        durationInfo = formatDuration(currentData.cost.duration);
    } else if (segment && segment.duration) {
        durationInfo = formatDuration(segment.duration);
    }
    
    if (currentData && currentData.distance) {
        distanceInfo = formatDistance(currentData.distance);
    } else if (segment && segment.distance) {
        distanceInfo = formatDistance(segment.distance);
    }

    var walkLink = '';
    var elementInstruction = '';
    var subwayStopsHtml = '';
    var busStopsHtml = '';

    // 如果是步行路段，检查是否为站内换乘，否则生成OM导航链接
    if (type === 'WALK') {
        elementInstruction = '步行';
        // 检查前后路段是否都是地铁
        var isStationTransfer = checkStationTransfer(segments, Math.floor(index));

        if (isStationTransfer) {
            walkLink = '<span style="color: #c586c0; font-size: 12px;">站内换乘</span>';
        } else {
            
            // 为步行元素创建一个临时的segment对象
            var walkingSegment = {
                walking: currentData,
                instruction: elementInstruction
            };
            walkLink = generateWalkOMLink(walkingSegment);
        }
    }
    // 处理公交路段
    else if (type === 'BUS') {
        // 为公交元素创建一个专门的segment对象，不依赖原始segment
        var busSegment = {
            transit: currentData,
            bus: currentData,
            instruction: elementInstruction,
            transit_mode: 'BUS'
        };
        
        // 尝试从公交路段数据中提取信息
        var formattedInstruction = formatBusInstruction(busSegment);
        if (formattedInstruction) {
            elementInstruction = formattedInstruction.replace(/，乘坐\d+站/, '').replace(/乘坐\d+站，/, '').replace(/乘坐\d+站/, '');
        } else {
            // 备用方案：从数据中生成指令
            if (currentData && currentData.buslines && currentData.buslines.length > 0) {
                var firstLine = currentData.buslines[0];
                var lineNames = [];
                if (firstLine.name) {
                    var lineName = firstLine.name.replace(/\([^)]*\)/g, ''); // 去掉括号内容
                    lineNames.push(lineName);
                }
                if (lineNames.length > 0) {
                    elementInstruction = lineNames.join('/');
                    if (firstLine.departure_stop && firstLine.departure_stop.name) {
                        elementInstruction += '，上车站：' + firstLine.departure_stop.name;
                    }
                    if (firstLine.via_stops[1] && firstLine.via_stops[1].name) {
                        elementInstruction += '，下一站：' + firstLine.via_stops[1].name;
                    }
                }
            }
        }
        if (!elementInstruction) {
            elementInstruction = '乘坐公交';
        }

        // 生成公交站点列表
        busStopsHtml = renderBusStops(busSegment, routeIndex, index);
    }
    // 处理地铁路段
    else if (type === 'SUBWAY' || type === 'RAILWAY') {
        // 为地铁元素创建一个专门的segment对象，不依赖原始segment
        var subwaySegment = {
            transit: currentData,
            bus: currentData,
            instruction: elementInstruction,
            transit_mode: type
        };
        
        // 尝试从地铁路段数据中提取信息
        var formattedInstruction = formatSubwayInstruction(subwaySegment);
        if (formattedInstruction) {
            elementInstruction = formattedInstruction.replace(/，乘坐\d+站/, '');
        } else {
            // 备用方案：从数据中生成指令
            if (currentData && currentData.buslines && currentData.buslines.length > 0) {
                var lineNames = [];
                currentData.buslines.forEach(function(line) {
                    if (line.name) {
                        var lineName = line.name.replace(/\([^)]*\)/g, ''); // 去掉括号内容
                        lineNames.push(lineName);
                    }
                });
                if (lineNames.length > 0) {
                    elementInstruction = lineNames.join('/');
                    if (currentData.buslines[0].departureStop && currentData.buslines[0].departureStop.name) {
                        elementInstruction += '，上车站：' + currentData.buslines[0].departureStop.name;
                    }
                    if (currentData.buslines[0].viaStops[1] && currentData.buslines[0].viaStops[1].name) {
                        elementInstruction += '，下一站：' + currentData.buslines[0].viaStops[1].name;
                    }
                }
            }
        }
        if (!elementInstruction) {
            elementInstruction = '乘坐地铁';
        }

        // 生成地铁站点列表
        subwayStopsHtml = renderSubwayStops(subwaySegment, routeIndex, index);
    }

    var stepHtml = `
                <div class="step-item">
                    <div class="step-icon ${iconClass}">${iconText}</div>
                    <div class="step-content">
                        <div class="step-instruction">${elementInstruction}</div>
                        <div class="step-details">
                            <div>
                                ${durationInfo ? '<span style="color: #4ec9b0;">时间：' + durationInfo + '</span>' : ''} 
                                ${distanceInfo ? '<span style="color: #569cd6;">距离：' + distanceInfo + '</span>' : ''}
                            </div>
                            <div>
                                ${walkLink}
                            </div>
                        </div>
                        ${subwayStopsHtml}
                        ${busStopsHtml}
                    </div>
                </div>
            `;

    return stepHtml;
}

// 渲染路线
function renderRoute(route, index) {
    var transportTypes = getTransportSummary(route.segments);
    var actualCost = getActualCost(route);
    var walkingDistance = getWalkingDistance(route.segments);

    // 生成交通方式徽章
    var transportBadges = transportTypes.map(function (type) {
        var badgeClass = type === '步行' ? 'walk' : (type === '地铁' ? 'metro' : 'bus');
        return `<span class="transport-badge ${badgeClass}">${type}</span>`;
    }).join('');

    // 根据是否有费用信息来决定显示内容
    var costDisplay = actualCost !== null && actualCost !== undefined ?
        `<div class="route-cost">¥${actualCost}</div>` : '';

    var routeHtml = `
                <div class="route-item" data-route-index="${index}">
                    <div class="route-header" onclick="toggleRoute(${index})">
                        <div class="route-title">
                            <div class="expand-icon" id="expand-icon-${index}"></div>
                            路线${index + 1}
                        </div>
                        <div class="route-summary">
                            <div class="route-time">${formatDuration(route.time)}</div>
                            <div class="route-distance">步行${formatDistance(walkingDistance)}</div>
                            ${costDisplay}
                        </div>
                    </div>
                    <div class="route-steps" id="route-steps-${index}">
                        ${renderSteps(route.segments, index)}
                    </div>
                </div>
            `;
    return routeHtml;
}

// 折叠/展开路线
function toggleRoute(index) {
    var allRouteSteps = document.querySelectorAll('.route-steps');
    var allExpandIcons = document.querySelectorAll('.expand-icon');
    var allRouteHeaders = document.querySelectorAll('.route-header');

    // 折叠所有其他路线
    for (var i = 0; i < allRouteSteps.length; i++) {
        if (i !== index) {
            allRouteSteps[i].classList.remove('expanded');
            allExpandIcons[i].classList.remove('expanded');
            allRouteHeaders[i].classList.remove('expanded');
        }
    }

    // 切换当前路线
    var currentSteps = document.getElementById('route-steps-' + index);
    var currentIcon = document.getElementById('expand-icon-' + index);
    var currentHeader = currentSteps.previousElementSibling;

    if (currentSteps.classList.contains('expanded')) {
        // 如果当前已展开，则折叠
        currentSteps.classList.remove('expanded');
        currentIcon.classList.remove('expanded');
        currentHeader.classList.remove('expanded');
    } else {
        // 展开当前路线
        currentSteps.classList.add('expanded');
        currentIcon.classList.add('expanded');
        currentHeader.classList.add('expanded');
    }
}

// 显示错误信息
function showError(message) {
    var errorDiv = document.getElementById('error');
    errorDiv.textContent = message;
    errorDiv.classList.remove('hidden');

    setTimeout(function () {
        errorDiv.classList.add('hidden');
    }, 5000);
}

// 搜索路线 - Web API版本
function searchRoute() {
    var city = getCurrentCity();
    var startKeyword = document.getElementById('startinput').value.trim();
    var endKeyword = document.getElementById('endinput').value.trim();

    // 保存起终点到本地存储
    saveStartEnd();

    if (!city) {
        showError('请输入城市名称');
        return;
    }

    if (!startKeyword) {
        showError('请输入出发地');
        return;
    }

    if (!endKeyword) {
        showError('请输入目的地');
        return;
    }

    // 显示加载状态
    document.getElementById('loading').classList.remove('hidden');
    document.getElementById('result').classList.add('hidden');
    document.getElementById('error').classList.add('hidden');
    document.getElementById('search-btn').disabled = true;

    // 搜索起点和终点坐标
    var startSearchPromise = new Promise(function (resolve) {
        if (startLocation) {
            resolve(startLocation);
        } else {
            searchLocation(startKeyword, city, true, resolve);
        }
    });

    var endSearchPromise = new Promise(function (resolve) {
        if (endLocation) {
            resolve(endLocation);
        } else {
            searchLocation(endKeyword, city, false, resolve);
        }
    });

    Promise.all([startSearchPromise, endSearchPromise]).then(function (locations) {
        var startLoc = locations[0];
        var endLoc = locations[1];

        if (!startLoc || !endLoc) {
            throw new Error('无法找到起点或终点的位置信息');
        }

        // 获取出发时间
        var departureTime = getDepartureTimestamp();

        // 使用Web API进行公交路径规划
        searchTransitRouteWebAPI(startLoc, endLoc, city, departureTime);

    }).catch(function (error) {
        document.getElementById('loading').classList.add('hidden');
        document.getElementById('search-btn').disabled = false;
        showError(error.message);
    });
}

// 使用Web API进行公交路径规划
function searchTransitRouteWebAPI(startLoc, endLoc, city, departureTime) {
    // 构建API请求URL
    var baseUrl = 'https://restapi.amap.com/v5/direction/transit/integrated';
    var params = new URLSearchParams();

    // 获取城市编码，优先使用编码，如果没有匹配则使用原始城市名
    var cityCode = getCurrentCityCode();
    var cityToUse = cityCode || city;

    // 必填参数
    params.append('key', window.AMAP_CONFIG.webApiKey);
    params.append('origin', startLoc.lng + ',' + startLoc.lat);
    params.append('destination', endLoc.lng + ',' + endLoc.lat);
    params.append('city1', cityToUse);
    params.append('city2', cityToUse);
    params.append('show_fields', 'cost');

    // 可选参数 - 策略值必须使用数字字符串
    var strategyValue = getPolicyValue();
    // 确保策略值是有效的数字字符串（0-8）
    var validStrategies = ['0', '1', '2', '3', '4', '5', '7', '8'];
    var mappedStrategy = validStrategies.includes(strategyValue) ? strategyValue : '0';
    params.append('strategy', mappedStrategy);
    params.append('alternative_route', '8'); // 返回5条路线
    params.append('night_flag', '1'); // 考虑夜班车

    // 如果有出发时间，添加时间参数
    if (departureTime) {
        var date = new Date(departureTime * 1000);
        var dateStr = date.getFullYear() + '-' +
            String(date.getMonth() + 1).padStart(2, '0') + '-' +
            String(date.getDate()).padStart(2, '0');
        var timeStr = String(date.getHours()).padStart(2, '0') + '-' +
            String(date.getMinutes()).padStart(2, '0');
        params.append('date', dateStr);
        params.append('time', timeStr);
    }

    // 发送请求
    var requestUrl = baseUrl + '?' + params.toString();

    fetch(requestUrl)
        .then(function (response) {
            if (!response.ok) {
                throw new Error('HTTP ' + response.status + ': ' + response.statusText);
            }
            return response.json();
        })
        .then(function (data) {
            handleWebAPIResult(data);
        })
        .catch(function (error) {
            console.error('Web API请求错误:', error);
            document.getElementById('loading').classList.add('hidden');
            document.getElementById('search-btn').disabled = false;
            showError('路线规划失败：' + error.message);
        });
}

// 处理Web API路线搜索结果
function handleWebAPIResult(data) {
    document.getElementById('loading').classList.add('hidden');
    document.getElementById('search-btn').disabled = false;


    if (data.status === '1' && data.route && data.route.transits && data.route.transits.length > 0) {

        // 成功获取路线，添加到历史记录
        var startValue = document.getElementById('startinput').value.trim();
        var endValue = document.getElementById('endinput').value.trim();

        if (startValue) {
            updateSearchHistory(startValue, startValue, 'start');
        }
        if (endValue) {
            updateSearchHistory(endValue, endValue, 'end');
        }

        // 转换Web API数据格式为原来的格式
        var convertedPlans = convertWebAPIToLegacyFormat(data.route.transits);

        var routesHtml = '';
        convertedPlans.forEach(function (plan, index) {
            routesHtml += renderRoute(plan, index);
        });

        document.getElementById('routes-container').innerHTML = routesHtml;
        document.getElementById('result').classList.remove('hidden');

    } else {
        var errorMsg = '路线规划失败：';
        if (data.status !== '1') {
            errorMsg += 'API状态码：' + data.status;
            if (data.info) {
                errorMsg += '，' + data.info;
            }
            if (data.error_code) {
                errorMsg += '（错误代码：' + data.error_code + '）';
            }
        } else if (!data.route) {
            errorMsg += '未找到路线数据';
        } else if (!data.route.transits) {
            errorMsg += '未找到公交路线';
        } else if (data.route.transits.length === 0) {
            errorMsg += '该路线暂无公交方案';
        } else {
            errorMsg += '未知错误';
        }
        showError(errorMsg);
    }
}

// 将Web API数据格式转换为原来的格式
function convertWebAPIToLegacyFormat(transits) {
    return transits.map(function (transit, transitIndex) {
        var segments = [];

        if (transit.segments) {
            segments = [];
            
            transit.segments.forEach(function (segment, index) {
                // 处理包含多种交通方式的路段
                var processedSegments = [];
                
                // 处理步行路段
                if (segment.walking) {
                    var walkingInstruction = '步行';
                    if (segment.walking.steps && segment.walking.steps.length > 0) {
                        var lastStep = segment.walking.steps[segment.walking.steps.length - 1];
                        walkingInstruction = lastStep.instruction || '步行';
                    }
                    
                    var walkingSegment = {
                        instruction: walkingInstruction,
                        duration: segment.walking.cost ? parseInt(segment.walking.cost.duration) || 0 : 0,
                        distance: parseInt(segment.walking.distance) || 0,
                        transit_mode: 'WALK',
                        time: segment.walking.cost ? parseInt(segment.walking.cost.duration) || 0 : 0,
                        walking: segment.walking
                    };

                    // 处理步行路段的详细信息
                    if (segment.walking.steps) {
                        walkingSegment.transit = {
                            origin: segment.walking.origin ? segment.walking.origin.split(',').map(Number).reverse() : null,
                            destination: segment.walking.destination ? segment.walking.destination.split(',').map(Number).reverse() : null,
                            steps: segment.walking.steps
                        };
                    }
                    
                    processedSegments.push(walkingSegment);
                }
                
                // 处理公交路段（只在segment主要包含公交数据时处理）
                if (segment.bus && segment.bus.buslines && segment.bus.buslines.length > 0) {
                    // 检查这个segment是否主要是公交segment（避免重复处理混合路段中的公交）
                    var isMainBusSegment = !segment.walking; // 如果没有步行数据，说明这是纯公交segment
                    
                    segment.bus.buslines.forEach(function(busline, buslineIndex) {
                        var lineName = busline.name || '';
                        var departureStop = busline.departure_stop;
                        var arrivalStop = busline.arrival_stop;
                        var viaStops = busline.via_stops || [];
                        
                        // 检查是否为地铁线路
                        var isSubway = busline.type && busline.type.includes('地铁') || 
                                       busline.name && busline.name.includes('地铁') ||
                                       busline.id && busline.id.includes('subway');
                        
                        var busSegment = {
                            instruction: lineName + ' 到 ' + (arrivalStop ? arrivalStop.name : '终点'),
                            duration: busline.cost ? parseInt(busline.cost.duration) || 0 : 0,
                            distance: parseInt(busline.distance) || 0,
                            transit_mode: isSubway ? 'SUBWAY' : 'BUS',
                            time: busline.cost ? parseInt(busline.cost.duration) || 0 : 0,
                            bus: segment.bus
                        };

                        // 设置transit信息，每条线路单独处理
                        busSegment.transit = {
                            lines: [busline], // 只包含当前线路
                            on_station: departureStop,
                            off_station: arrivalStop,
                            via_stops: viaStops
                        };
                        
                        processedSegments.push(busSegment);
                    });
                }
                
                // 处理铁路路段（地铁）
                if (segment.railway) {
                    var railwaySegment = {
                        instruction: '乘坐地铁',
                        duration: 0,
                        distance: 0,
                        transit_mode: 'SUBWAY',
                        time: 0,
                        railway: segment.railway
                    };
                    processedSegments.push(railwaySegment);
                }
                
                // 将处理好的segments添加到总的segments数组中
                processedSegments.forEach(function(processedSegment) {
                    segments.push(processedSegment);
                });
            });
        }
        return {
            time: transit.cost ? parseInt(transit.cost.duration) || 0 : 0,
            distance: parseInt(transit.distance) || 0,
            cost: transit.cost ? parseFloat(transit.cost.transit_fee) || 0 : 0,
            segments: segments
        };
    });
}



// 绑定搜索按钮事件
document.getElementById('search-btn').addEventListener('click', searchRoute);

// 移除重复的回车事件处理，因为输入提示功能已经处理了回车键

document.getElementById('cityinput').addEventListener('keypress', function (e) {
    if (e.key === 'Enter') {
        saveCity(this.value);
        document.getElementById('startinput').focus();
    }
});

// 更新搜索服务的城市
function updateSearchCity() {
    var city = getCurrentCity();
    if (city !== currentCity) {
        currentCity = city;
        setupAutocomplete();
    }
}