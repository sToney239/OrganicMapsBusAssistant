// eviltransform.js - 坐标转换库
// 来源：https://github.com/googollee/eviltransform/blob/master/javascript/transform.js

function outOfChina(lat, lng) {
    if (lng < 72.004 || lng > 137.8347)
        return true;
    if (lat < 0.8293 || lat > 55.8271)
        return true;
    return false;
}
var earthR = 6378137.0;
function transform(x, y) {
    var xy = x * y;
    var absX = Math.sqrt(Math.abs(x));
    var xPi = x * Math.PI;
    var yPi = y * Math.PI;
    var d = 20.0 * Math.sin(6.0 * xPi) + 20.0 * Math.sin(2.0 * xPi);

    var lat = d;
    var lng = d;

    lat += 20.0 * Math.sin(yPi) + 40.0 * Math.sin(yPi / 3.0);
    lng += 20.0 * Math.sin(xPi) + 40.0 * Math.sin(xPi / 3.0);

    lat += 160.0 * Math.sin(yPi / 12.0) + 320 * Math.sin(yPi / 30.0);
    lng += 150.0 * Math.sin(xPi / 12.0) + 300.0 * Math.sin(xPi / 30.0);

    lat *= 2.0 / 3.0;
    lng *= 2.0 / 3.0;

    lat += -100.0 + 2.0 * x + 3.0 * y + 0.2 * y * y + 0.1 * xy + 0.2 * absX;
    lng += 300.0 + x + 2.0 * y + 0.1 * x * x + 0.1 * xy + 0.1 * absX;

    return { lat: lat, lng: lng }
}
function delta(lat, lng) {
    var ee = 0.00669342162296594323;
    var d = transform(lng - 105.0, lat - 35.0);
    var radLat = lat / 180.0 * Math.PI;
    var magic = Math.sin(radLat);
    magic = 1 - ee * magic * magic;
    var sqrtMagic = Math.sqrt(magic);
    d.lat = (d.lat * 180.0) / ((earthR * (1 - ee)) / (magic * sqrtMagic) * Math.PI);
    d.lng = (d.lng * 180.0) / (earthR / sqrtMagic * Math.cos(radLat) * Math.PI);
    return d;
}

function gcj2wgs_exact(gcjLat, gcjLng) {
    var newLat = gcjLat, newLng = gcjLng;
    var oldLat = newLat, oldLng = newLng;
    var threshold = 1e-6;

    for (var i = 0; i < 50; i++) {
        oldLat = newLat;
        oldLng = newLng;
        var d = delta(newLat, newLng);
        newLat = gcjLat - d.lat;
        newLng = gcjLng - d.lng;
        if (Math.max(Math.abs(oldLat - newLat), Math.abs(oldLng - newLng)) < threshold) {
            break;
        }
    }
    return { lat: newLat, lng: newLng };
}
function wgs2gcj(wgsLat, wgsLng) {
	if (outOfChina(wgsLat, wgsLng)) {
		return {lat: wgsLat, lng: wgsLng};
	}
	var d = delta(wgsLat, wgsLng);
	return {lat: wgsLat + d.lat, lng: wgsLng + d.lng};
}
