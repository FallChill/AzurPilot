(function() {
    var chartType = "__CHART_TYPE__";
    var labels = __LABELS__;
    var opens  = __OPENS__;
    var highs  = __HIGHS__;
    var lows   = __LOWS__;
    var closes = __CLOSES__;
    var counts = __COUNTS__;
    var ap = __AP__;
    var avg = __AVG__;
    var nn = chartType === 'line' ? ap.length : labels.length;
    if (nn < 1) return;

    var cv = document.getElementById("__CHART_ID__");
    if (!cv) return;
    var tipEl = document.getElementById("__CHART_ID___tip");
    var ovCv = document.getElementById("__CHART_ID___ov");

    var dpr = window.devicePixelRatio || 1;
    var W = cv.clientWidth, H = cv.clientHeight;
    cv.width = W * dpr; cv.height = H * dpr;
    ovCv.width = W * dpr; ovCv.height = H * dpr;
    ovCv.style.width = W + "px"; ovCv.style.height = H + "px";

    var ctx = cv.getContext("2d");
    ctx.scale(dpr, dpr);
    var oc = ovCv.getContext("2d");

    var pad = {t: 20, r: 20, b: 52, l: 52};
    var gW = W - pad.l - pad.r, gH = H - pad.t - pad.b;

    var allMin = Infinity, allMax = -Infinity;
    if (chartType === 'line') {
        for (var i = 0; i < nn; i++) {
            if (ap[i] < allMin) allMin = ap[i];
            if (ap[i] > allMax) allMax = ap[i];
        }
    } else {
        for (var i = 0; i < nn; i++) {
            if (lows[i] < allMin) allMin = lows[i];
            if (highs[i] > allMax) allMax = highs[i];
        }
    }
    var rng = allMax - allMin || 1;
    allMin -= rng * 0.08;
    allMax += rng * 0.08;

    function xOfLine(i) { return pad.l + (i / Math.max(nn - 1, 1)) * gW; }
    function yOf(v) { return pad.t + gH - (v - allMin) / (allMax - allMin) * gH; }

    var candleSpace = gW / nn;
    var candleW = Math.max(3, Math.min(candleSpace * 0.6, 30));
    function xCenter(i) { return pad.l + candleSpace * (i + 0.5); }

    ctx.fillStyle = "#1a1a2e";
    ctx.fillRect(0, 0, W, H);

    ctx.strokeStyle = "#2a2a3e";
    ctx.lineWidth = 1;
    ctx.fillStyle = "#666";
    ctx.font = "11px -apple-system, sans-serif";
    ctx.textAlign = "right";
    ctx.textBaseline = "middle";
    for (var i = 0; i <= 5; i++) {
        var v = allMin + (allMax - allMin) * (i / 5);
        var y = yOf(v);
        ctx.beginPath(); ctx.moveTo(pad.l, y); ctx.lineTo(W - pad.r, y); ctx.stroke();
        ctx.fillText(Math.round(v), pad.l - 8, y);
    }

    var avgY = yOf(avg);
    ctx.save();
    ctx.strokeStyle = "#ff9800";
    ctx.lineWidth = 1;
    ctx.setLineDash([6, 4]);
    ctx.beginPath(); ctx.moveTo(pad.l, avgY); ctx.lineTo(W - pad.r, avgY); ctx.stroke();
    ctx.restore();
    ctx.fillStyle = "#ff9800";
    ctx.font = "10px -apple-system, sans-serif";
    ctx.textAlign = "right";
    ctx.fillText("均值:" + avg, W - pad.r - 4, avgY - 8);

    ctx.fillStyle = "#666";
    ctx.font = "10px -apple-system, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    if (chartType === 'line') {
        var labelStep = Math.max(1, Math.floor(nn / 8));
        for (var i = 0; i < nn; i += labelStep) {
            ctx.save();
            ctx.translate(xOfLine(i), H - pad.b + 8);
            ctx.rotate(0.4);
            ctx.fillText(labels[i], 0, 0);
            ctx.restore();
        }
    } else {
        var labelStep = Math.max(1, Math.floor(nn / 12));
        for (var i = 0; i < nn; i += labelStep) {
            ctx.fillText(labels[i], xCenter(i), H - pad.b + 8);
        }
    }

    if (chartType === 'line') {
        var grad = ctx.createLinearGradient(0, pad.t, 0, pad.t + gH);
        grad.addColorStop(0, "rgba(100,120,160,0.18)");
        grad.addColorStop(1, "rgba(100,120,160,0.02)");
        ctx.beginPath();
        ctx.moveTo(xOfLine(0), yOf(ap[0]));
        for (var i = 1; i < nn; i++) {
            if (nn < 30) {
                var x0 = xOfLine(i-1), y0 = yOf(ap[i-1]), x1 = xOfLine(i), y1 = yOf(ap[i]);
                var cpx = (x0 + x1) / 2;
                ctx.bezierCurveTo(cpx, y0, cpx, y1, x1, y1);
            } else {
                ctx.lineTo(xOfLine(i), yOf(ap[i]));
            }
        }
        ctx.lineTo(xOfLine(nn-1), pad.t + gH);
        ctx.lineTo(xOfLine(0), pad.t + gH);
        ctx.closePath();
        ctx.fillStyle = grad;
        ctx.fill();

        ctx.lineWidth = 2;
        ctx.lineJoin = "round";
        for (var i = 1; i < nn; i++) {
            ctx.beginPath();
            ctx.moveTo(xOfLine(i-1), yOf(ap[i-1]));
            var segmentColor = ap[i] >= ap[i-1] ? "#ef5350" : "#26a69a";
            ctx.strokeStyle = segmentColor;
            if (nn < 30) {
                var x0 = xOfLine(i-1), y0 = yOf(ap[i-1]), x1 = xOfLine(i), y1 = yOf(ap[i]);
                var cpx = (x0 + x1) / 2;
                ctx.bezierCurveTo(cpx, y0, cpx, y1, x1, y1);
            } else {
                ctx.lineTo(xOfLine(i), yOf(ap[i]));
            }
            ctx.stroke();
        }
        if (nn < 60) {
            for (var i = 0; i < nn; i++) {
                ctx.beginPath();
                ctx.arc(xOfLine(i), yOf(ap[i]), 3.5, 0, Math.PI * 2);
                var dotColor = (i > 0 && ap[i] < ap[i-1]) ? "#26a69a" : "#ef5350";
                ctx.fillStyle = dotColor;
                ctx.fill();
                ctx.strokeStyle = "#1a1a2e";
                ctx.lineWidth = 1.5;
                ctx.stroke();
            }
        }
    } else {
        for (var i = 0; i < nn; i++) {
            var cx = xCenter(i);
            var o = opens[i], h = highs[i], l = lows[i], c = closes[i];
            var isUp = c > o;
            var isDown = c < o;
            var isFlat = c === o;
            var color = isFlat ? "#888" : (isUp ? "#ef5350" : "#26a69a");

            ctx.strokeStyle = color;
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            ctx.moveTo(cx, yOf(h));
            ctx.lineTo(cx, yOf(l));
            ctx.stroke();

            var bodyTop = yOf(Math.max(o, c));
            var bodyBot = yOf(Math.min(o, c));
            var bodyH = Math.max(bodyBot - bodyTop, 1);

            if (isUp || isDown) {
                ctx.fillStyle = color;
                ctx.fillRect(cx - candleW / 2, bodyTop, candleW, bodyH);
            } else {
                ctx.beginPath();
                ctx.moveTo(cx - candleW / 2, yOf(o));
                ctx.lineTo(cx + candleW / 2, yOf(o));
                ctx.stroke();
            }
        }

        function drawMA(days, maColor) {
            if (nn < days) return;
            ctx.beginPath();
            ctx.lineWidth = 1.5;
            ctx.strokeStyle = maColor;
            var started = false;
            for (var i = days - 1; i < nn; i++) {
                var sum = 0;
                for (var j = 0; j < days; j++) sum += closes[i - j];
                var maVal = sum / days;
                var x = xCenter(i), y = yOf(maVal);
                if (!started) { ctx.moveTo(x, y); started = true; }
                else { ctx.lineTo(x, y); }
            }
            ctx.stroke();
        }
        drawMA(5, "#ffeb3b");
        drawMA(10, "#e91e63");
    }

    cv.addEventListener("mousemove", function(e) {
        var rect = cv.getBoundingClientRect();
        var mx_ = e.clientX - rect.left;
        var my_ = e.clientY - rect.top;

        oc.setTransform(1, 0, 0, 1, 0, 0);
        oc.clearRect(0, 0, ovCv.width, ovCv.height);

        if (mx_ < pad.l || mx_ > W - pad.r || my_ < pad.t || my_ > pad.t + gH) {
            tipEl.style.display = "none";
            return;
        }

        oc.scale(dpr, dpr);

        if (chartType === 'line') {
            var ratio = (mx_ - pad.l) / gW;
            var idx = Math.round(ratio * (nn - 1));
            idx = Math.max(0, Math.min(nn - 1, idx));
            var px = xOfLine(idx), py = yOf(ap[idx]);

            oc.strokeStyle = "rgba(255,255,255,0.18)";
            oc.lineWidth = 1;
            oc.setLineDash([4, 3]);
            oc.beginPath(); oc.moveTo(px, pad.t); oc.lineTo(px, pad.t + gH); oc.stroke();
            oc.beginPath(); oc.moveTo(pad.l, py); oc.lineTo(W - pad.r, py); oc.stroke();
            oc.setLineDash([]);

            oc.beginPath(); oc.arc(px, py, 6, 0, Math.PI * 2);
            oc.fillStyle = "rgba(100,181,246,0.3)"; oc.fill();
            oc.beginPath(); oc.arc(px, py, 4, 0, Math.PI * 2);
            oc.fillStyle = "#64b5f6"; oc.fill();
            oc.strokeStyle = "#fff"; oc.lineWidth = 2; oc.stroke();
            oc.setTransform(1, 0, 0, 1, 0, 0);

            var diff = idx > 0 ? (ap[idx] - ap[idx - 1]) : 0;
            var isUp = diff >= 0;
            var dc = isUp ? "#ef5350" : "#26a69a";
            var ds = (isUp ? "+" : "") + diff;
            tipEl.innerHTML = '<div style="color:#888;margin-bottom:4px;font-weight:600">' + labels[idx] + '</div>'
                + '<div>体力: <b style="color:#64b5f6">' + ap[idx] + '</b></div>'
                + '<div>单次变化: <b style="color:' + dc + '">' + ds + '</b></div>';
        } else {
            var idx = Math.floor((mx_ - pad.l) / candleSpace);
            idx = Math.max(0, Math.min(nn - 1, idx));
            var cx = xCenter(idx);

            oc.strokeStyle = "rgba(255,255,255,0.18)";
            oc.lineWidth = 1;
            oc.setLineDash([4, 3]);
            oc.beginPath(); oc.moveTo(cx, pad.t); oc.lineTo(cx, pad.t + gH); oc.stroke();
            oc.beginPath(); oc.moveTo(pad.l, my_); oc.lineTo(W - pad.r, my_); oc.stroke();
            oc.setLineDash([]);

            oc.strokeStyle = "#fff";
            oc.lineWidth = 1;
            oc.globalAlpha = 0.15;
            oc.fillStyle = "#fff";
            oc.fillRect(cx - candleW / 2 - 2, pad.t, candleW + 4, gH);
            oc.globalAlpha = 1.0;
            oc.setTransform(1, 0, 0, 1, 0, 0);

            var o = opens[idx], h = highs[idx], l = lows[idx], c_ = closes[idx];
            var chg = c_ - o;
            var chgPct = o !== 0 ? ((chg / o) * 100).toFixed(1) : "0.0";
            var isUp = c_ >= o;
            var dc = isUp ? "#ef5350" : "#26a69a";
            var chgSign = chg >= 0 ? "+" : "";

            var ma5Val = "-";
            if (idx >= 4) {
                var sum5 = 0; for(var j=0; j<5; j++) sum5+=closes[idx-j];
                ma5Val = (sum5/5).toFixed(1);
            }
            var ma10Val = "-";
            if (idx >= 9) {
                var sum10 = 0; for(var j=0; j<10; j++) sum10+=closes[idx-j];
                ma10Val = (sum10/10).toFixed(1);
            }

            tipEl.innerHTML = '<div style="color:#888;margin-bottom:4px;font-weight:600">' + labels[idx] + '</div>'
                + '<div>开盘: <b>' + o + '</b> <span style="margin-left:8px;color:#ffeb3b">MA5(5期平均): ' + ma5Val + '</span></div>'
                + '<div>收盘: <b style="color:' + dc + '">' + c_ + '</b> <span style="margin-left:8px;color:#e91e63">MA10(10期平均): ' + ma10Val + '</span></div>'
                + '<div>最高: <b style="color:#ef5350">' + h + '</b></div>'
                + '<div>最低: <b style="color:#26a69a">' + l + '</b></div>'
                + '<div>涨跌: <b style="color:' + dc + '">' + chgSign + chg + ' (' + chgSign + chgPct + '%)</b></div>'
                + '<div style="color:#666;margin-top:4px">数据点密度: ' + counts[idx] + '</div>';
        }

        tipEl.style.display = "block";
        var tx = (chartType === 'line' ? px : cx) + 18;
        var ty = my_ - 60;
        if (tx + 180 > W) tx = (chartType === 'line' ? px : cx) - 200;
        if (ty < 8) ty = my_ + 18;
        tipEl.style.left = tx + "px";
        tipEl.style.top = ty + "px";
    });

    cv.addEventListener("mouseleave", function() {
        tipEl.style.display = "none";
        oc.setTransform(1, 0, 0, 1, 0, 0);
        oc.clearRect(0, 0, ovCv.width, ovCv.height);
    });
})();

(function() {
    var detailLabels = __DETAIL_LABELS__;
    var detailAp = __DETAIL_AP__;
    var detailSources = __DETAIL_SOURCES__;
    var detailChartId = "__DETAIL_CHART_ID__";
    var detailDisplay = "__DETAIL_DISPLAY__";

    if (detailDisplay === 'none' || !detailLabels || detailLabels.length === 0) return;

    var dcv = document.getElementById(detailChartId);
    if (!dcv) return;
    var dtipEl = document.getElementById(detailChartId + "_tip");
    var dovCv = document.getElementById(detailChartId + "_ov");

    var ddpr = window.devicePixelRatio || 1;
    var dW = dcv.clientWidth, dH = dcv.clientHeight;
    dcv.width = dW * ddpr; dcv.height = dH * ddpr;
    dovCv.width = dW * ddpr; dovCv.height = dH * ddpr;
    dovCv.style.width = dW + "px"; dovCv.style.height = dH + "px";

    var dctx = dcv.getContext("2d");
    dctx.scale(ddpr, ddpr);
    var doc = dovCv.getContext("2d");

    var zoomLevel = 1.0;
    var panOffset = 0;
    var maxZoom = 5.0;
    var minZoom = 0.5;

    function renderDetailChart() {
        var dnn = detailAp.length;
        if (dnn < 1) return;

        var dpad = {t: 16, r: 16, b: 40, l: 48};
        var dgW = dW - dpad.l - dpad.r, dgH = dH - dpad.t - dpad.b;

        var visibleStart = Math.max(0, Math.floor(panOffset));
        var visibleCount = Math.ceil(dnn / zoomLevel);
        var visibleEnd = Math.min(dnn, visibleStart + visibleCount);

        var dMin = Infinity, dMax = -Infinity;
        for (var i = visibleStart; i < visibleEnd; i++) {
            if (detailAp[i] < dMin) dMin = detailAp[i];
            if (detailAp[i] > dMax) dMax = detailAp[i];
        }
        if (dMin === Infinity) dMin = 0;
        if (dMax === -Infinity) dMax = 100;
        var drng = dMax - dMin || 1;
        dMin -= drng * 0.1;
        dMax += drng * 0.1;

        dctx.fillStyle = "#1a1a2e";
        dctx.fillRect(0, 0, dW, dH);

        dctx.strokeStyle = "#2a2a3e";
        dctx.lineWidth = 1;
        dctx.fillStyle = "#666";
        dctx.font = "10px -apple-system, sans-serif";
        dctx.textAlign = "right";
        dctx.textBaseline = "middle";
        for (var i = 0; i <= 4; i++) {
            var v = dMin + (dMax - dMin) * (i / 4);
            var y = dpad.t + dgH - (v - dMin) / (dMax - dMin) * dgH;
            dctx.beginPath(); dctx.moveTo(dpad.l, y); dctx.lineTo(dW - dpad.r, y); dctx.stroke();
            dctx.fillText(Math.round(v), dpad.l - 6, y);
        }

        dctx.fillStyle = "#666";
        dctx.font = "9px -apple-system, sans-serif";
        dctx.textAlign = "center";
        dctx.textBaseline = "top";

        var xScale = dgW / visibleCount;
        function dxOf(i) { return dpad.l + (i - visibleStart) * xScale; }
        function dyOf(v) { return dpad.t + dgH - (v - dMin) / (dMax - dMin) * dgH; }

        var dgrad = dctx.createLinearGradient(0, dpad.t, 0, dpad.t + dgH);
        dgrad.addColorStop(0, "rgba(100,181,246,0.15)");
        dgrad.addColorStop(1, "rgba(100,181,246,0.02)");
        dctx.beginPath();
        dctx.moveTo(dxOf(visibleStart), dyOf(detailAp[visibleStart]));
        for (var i = visibleStart + 1; i < visibleEnd; i++) {
            dctx.lineTo(dxOf(i), dyOf(detailAp[i]));
        }
        dctx.lineTo(dxOf(visibleEnd - 1), dpad.t + dgH);
        dctx.lineTo(dxOf(visibleStart), dpad.t + dgH);
        dctx.closePath();
        dctx.fillStyle = dgrad;
        dctx.fill();

        dctx.lineWidth = 1.5;
        dctx.lineJoin = "round";
        for (var i = visibleStart + 1; i < visibleEnd; i++) {
            dctx.beginPath();
            dctx.moveTo(dxOf(i - 1), dyOf(detailAp[i - 1]));
            dctx.strokeStyle = detailAp[i] >= detailAp[i - 1] ? "#ef5350" : "#26a69a";
            dctx.lineTo(dxOf(i), dyOf(detailAp[i]));
            dctx.stroke();
        }

        var dotInterval = Math.max(1, Math.floor(visibleCount / 50));
        for (var i = visibleStart; i < visibleEnd; i += dotInterval) {
            dctx.beginPath();
            dctx.arc(dxOf(i), dyOf(detailAp[i]), 2.5, 0, Math.PI * 2);
            var dotColor = (i > visibleStart && detailAp[i] < detailAp[i - 1]) ? "#26a69a" : "#ef5350";
            dctx.fillStyle = dotColor;
            dctx.fill();
        }

        var labelInterval = Math.max(1, Math.floor(visibleCount / 8));
        for (var i = visibleStart; i < visibleEnd; i += labelInterval) {
            var lx = dxOf(i);
            dctx.save();
            dctx.translate(lx, dH - dpad.b + 6);
            dctx.rotate(0.3);
            dctx.fillText(detailLabels[i], 0, 0);
            dctx.restore();
        }
    }

    renderDetailChart();

    dcv.addEventListener("mousemove", function(e) {
        var rect = dcv.getBoundingClientRect();
        var mx = e.clientX - rect.left;
        var my = e.clientY - rect.top;

        doc.setTransform(1, 0, 0, 1, 0, 0);
        doc.clearRect(0, 0, dovCv.width, dovCv.height);

        var dpad = {t: 16, r: 16, b: 40, l: 48};
        var dgW = dW - dpad.l - dpad.r, dgH = dH - dpad.t - dpad.b;

        if (mx < dpad.l || mx > dW - dpad.r || my < dpad.t || my > dH - dpad.b) {
            dtipEl.style.display = "none";
            return;
        }

        doc.scale(ddpr, ddpr);

        var visibleCount = Math.ceil(detailAp.length / zoomLevel);
        var xScale = dgW / visibleCount;
        var idx = Math.floor(panOffset + (mx - dpad.l) / xScale);
        idx = Math.max(0, Math.min(detailAp.length - 1, idx));

        var dMin = Infinity, dMax = -Infinity;
        var visibleStart = Math.max(0, Math.floor(panOffset));
        var visibleEnd = Math.min(detailAp.length, visibleStart + visibleCount);
        for (var i = visibleStart; i < visibleEnd; i++) {
            if (detailAp[i] < dMin) dMin = detailAp[i];
            if (detailAp[i] > dMax) dMax = detailAp[i];
        }
        if (dMin === Infinity) dMin = 0;
        if (dMax === -Infinity) dMax = 100;
        var drng = dMax - dMin || 1;
        dMin -= drng * 0.1;
        dMax += drng * 0.1;

        function dxOf(i) { return dpad.l + (i - visibleStart) * xScale; }
        function dyOf(v) { return dpad.t + dgH - (v - dMin) / (dMax - dMin) * dgH; }

        var px = dxOf(idx), py = dyOf(detailAp[idx]);

        doc.strokeStyle = "rgba(255,255,255,0.15)";
        doc.lineWidth = 1;
        doc.setLineDash([3, 3]);
        doc.beginPath(); doc.moveTo(px, dpad.t); doc.lineTo(px, dpad.t + dgH); doc.stroke();
        doc.beginPath(); doc.moveTo(dpad.l, py); doc.lineTo(dW - dpad.r, py); doc.stroke();
        doc.setLineDash([]);

        doc.beginPath(); doc.arc(px, py, 5, 0, Math.PI * 2);
        doc.fillStyle = "rgba(100,181,246,0.3)"; doc.fill();
        doc.beginPath(); doc.arc(px, py, 3, 0, Math.PI * 2);
        doc.fillStyle = "#64b5f6"; doc.fill();
        doc.strokeStyle = "#fff"; doc.lineWidth = 1.5; doc.stroke();
        doc.setTransform(1, 0, 0, 1, 0, 0);

        var diff = idx > 0 ? (detailAp[idx] - detailAp[idx - 1]) : 0;
        var isUp = diff >= 0;
        var dc = isUp ? "#ef5350" : "#26a69a";
        var ds = (isUp ? "+" : "") + diff;
        var source = detailSources[idx] || '-';
        var sourceColor = source === 'cl1' ? '#64b5f6' : (source === 'meow' ? '#ff9800' : '#888');

        dtipEl.innerHTML = '<div style="color:#888;margin-bottom:4px;font-weight:600">' + detailLabels[idx] + '</div>'
            + '<div>体力: <b style="color:#64b5f6">' + detailAp[idx] + '</b></div>'
            + '<div>变化: <b style="color:' + dc + '">' + ds + '</b></div>'
            + '<div>来源: <b style="color:' + sourceColor + '">' + source + '</b></div>';

        dtipEl.style.display = "block";
        var tx = px + 16;
        var ty = my - 50;
        if (tx + 160 > dW) tx = px - 180;
        if (ty < 8) ty = my + 16;
        dtipEl.style.left = tx + "px";
        dtipEl.style.top = ty + "px";
    });

    dcv.addEventListener("mouseleave", function() {
        dtipEl.style.display = "none";
        doc.setTransform(1, 0, 0, 1, 0, 0);
        doc.clearRect(0, 0, dovCv.width, dovCv.height);
    });

    var isDragging = false;
    var dragStartX = 0;
    var dragStartPan = 0;

    dcv.addEventListener("mousedown", function(e) {
        isDragging = true;
        dragStartX = e.clientX;
        dragStartPan = panOffset;
        dcv.style.cursor = "grabbing";
    });

    document.addEventListener("mousemove", function(e) {
        if (!isDragging) return;
        var dx = e.clientX - dragStartX;
        var visibleCount = Math.ceil(detailAp.length / zoomLevel);
        var xScale = (dW - 48 - 16) / visibleCount;
        panOffset = Math.max(0, Math.min(detailAp.length - visibleCount, dragStartPan - dx / xScale));
        renderDetailChart();
    });

    document.addEventListener("mouseup", function() {
        isDragging = false;
        dcv.style.cursor = "crosshair";
    });

    var zoomInBtn = document.getElementById(detailChartId + "_zoom_in");
    var zoomOutBtn = document.getElementById(detailChartId + "_zoom_out");
    var resetBtn = document.getElementById(detailChartId + "_reset");

    if (zoomInBtn) {
        zoomInBtn.addEventListener("click", function() {
            zoomLevel = Math.min(maxZoom, zoomLevel * 1.5);
            renderDetailChart();
        });
    }
    if (zoomOutBtn) {
        zoomOutBtn.addEventListener("click", function() {
            zoomLevel = Math.max(minZoom, zoomLevel / 1.5);
            var visibleCount = Math.ceil(detailAp.length / zoomLevel);
            panOffset = Math.min(panOffset, Math.max(0, detailAp.length - visibleCount));
            renderDetailChart();
        });
    }
    if (resetBtn) {
        resetBtn.addEventListener("click", function() {
            zoomLevel = 1.0;
            panOffset = 0;
            renderDetailChart();
        });
    }

    dcv.addEventListener("wheel", function(e) {
        e.preventDefault();
        var delta = e.deltaY > 0 ? 0.9 : 1.1;
        zoomLevel = Math.max(minZoom, Math.min(maxZoom, zoomLevel * delta));
        var visibleCount = Math.ceil(detailAp.length / zoomLevel);
        panOffset = Math.min(panOffset, Math.max(0, detailAp.length - visibleCount));
        renderDetailChart();
    }, { passive: false });
})();
