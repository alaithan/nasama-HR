(function () {
  "use strict";

  function closestDownloadButton(target) {
    var button = target && target.closest ? target.closest("button") : null;
    if (!button) return null;
    if (!/Download PDF/i.test(button.textContent || "")) return null;
    if (!document.querySelector(".overlay .receipt")) return null;
    return button;
  }

  function closestPrintButton(target) {
    var button = target && target.closest ? target.closest("button") : null;
    if (!button) return null;
    if (!/Print/i.test(button.textContent || "")) return null;
    if (!document.querySelector(".overlay .receipt")) return null;
    return button;
  }

  function cleanFilePart(value, fallback) {
    return String(value || fallback || "receipt")
      .replace(/[^a-zA-Z0-9 -]/g, "")
      .trim()
      .replace(/\s+/g, "_")
      .slice(0, 70);
  }

  function getReceiptValue(labelText) {
    var items = document.querySelectorAll(".receipt-emp-item");
    for (var i = 0; i < items.length; i += 1) {
      var label = items[i].querySelector(".receipt-emp-label");
      if (!label) continue;
      if ((label.textContent || "").trim().toLowerCase() !== labelText.toLowerCase()) continue;
      var value = items[i].querySelector(".receipt-emp-value");
      return value ? value.textContent.trim() : "";
    }
    return "";
  }

  async function exportVisibleReceipt(button) {
    if (!window.jspdf || !window.html2canvas) {
      alert("PDF libraries still loading. Please wait a moment and try again.");
      return;
    }

    var receipt = document.querySelector(".overlay .receipt");
    if (!receipt) return;

    var originalText = button.textContent;
    button.disabled = true;
    button.textContent = "Generating...";

    try {
      if (document.fonts && document.fonts.ready) {
        await document.fonts.ready;
      }

      var canvas = await window.html2canvas(receipt, {
        scale: 2,
        useCORS: true,
        backgroundColor: "#ffffff",
        logging: false
      });

      var jsPDF = window.jspdf.jsPDF;
      var pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
      var pageWidth = pdf.internal.pageSize.getWidth();
      var pageHeight = pdf.internal.pageSize.getHeight();
      var margin = 8;
      var maxWidth = pageWidth - margin * 2;
      var maxHeight = pageHeight - margin * 2;
      var imageWidth = maxWidth;
      var imageHeight = canvas.height * imageWidth / canvas.width;

      if (imageHeight > maxHeight) {
        imageHeight = maxHeight;
        imageWidth = canvas.width * imageHeight / canvas.height;
      }

      var x = (pageWidth - imageWidth) / 2;
      var y = (pageHeight - imageHeight) / 2;
      pdf.addImage(canvas.toDataURL("image/png"), "PNG", x, y, imageWidth, imageHeight);

      var title = (document.querySelector(".modal-title") || {}).textContent || "Receipt";
      var person = getReceiptValue("Employee Name") || getReceiptValue("Broker Name");
      var period = (document.querySelector(".receipt-period") || {}).textContent || "";
      pdf.save("Nasama_" + cleanFilePart(title) + "_" + cleanFilePart(person, "employee") + "_" + cleanFilePart(period, "period") + ".pdf");
    } catch (error) {
      console.error("Receipt PDF export failed:", error);
      alert("PDF export failed: " + error.message);
    } finally {
      button.disabled = false;
      button.textContent = originalText;
    }
  }

  function waitForFrameAssets(frame) {
    var doc = frame.contentDocument;
    var images = Array.prototype.slice.call(doc.images || []);
    var imagePromises = images.map(function (image) {
      if (image.complete) return Promise.resolve();
      return new Promise(function (resolve) {
        image.onload = resolve;
        image.onerror = resolve;
      });
    });

    var fontPromise = doc.fonts && doc.fonts.ready ? doc.fonts.ready : Promise.resolve();
    return Promise.all(imagePromises.concat([fontPromise]));
  }

  async function printVisibleReceipt(button) {
    var receipt = document.querySelector(".overlay .receipt");
    if (!receipt) return;
    if (!window.html2canvas) {
      alert("Print tools still loading. Please wait a moment and try again.");
      return;
    }

    var originalText = button.textContent;
    button.disabled = true;
    button.textContent = "Preparing print...";

    var frame = document.createElement("iframe");
    frame.setAttribute("aria-hidden", "true");
    frame.style.cssText = "position:fixed;left:-10000px;top:0;width:210mm;height:297mm;border:0;background:#fff;";
    document.body.appendChild(frame);
    var printStarted = false;
    var cleanup = function () {
      if (frame.parentNode) frame.parentNode.removeChild(frame);
    };

    try {
      if (document.fonts && document.fonts.ready) {
        await document.fonts.ready;
      }

      var canvas = await window.html2canvas(receipt, {
        scale: 2,
        useCORS: true,
        backgroundColor: "#ffffff",
        logging: false
      });

      var doc = frame.contentDocument;
      var imageSrc = canvas.toDataURL("image/png");

      doc.open();
      doc.write(
        '<!doctype html><html><head><meta charset="utf-8">' +
          '<title>Nasama Receipt</title>' +
          '<style>' +
          '@page{size:A4;margin:8mm}' +
          'html,body{margin:0!important;padding:0!important;background:#fff!important;width:210mm;min-height:297mm;overflow:hidden!important;}' +
          'body{-webkit-print-color-adjust:exact!important;print-color-adjust:exact!important;}' +
          '#nasama-print-stage{width:194mm;height:281mm;overflow:hidden;background:#fff;display:flex;align-items:center;justify-content:center;}' +
          '#nasama-print-stage img{display:block;max-width:194mm;max-height:281mm;width:auto;height:auto;}' +
          '@media print{' +
          'html,body{width:210mm!important;height:297mm!important;overflow:hidden!important;}' +
          '#nasama-print-stage{width:194mm!important;height:281mm!important;overflow:hidden!important;page-break-after:avoid!important;break-after:avoid!important;}' +
          '#nasama-print-stage img{max-width:194mm!important;max-height:281mm!important;}' +
          '}' +
          '</style></head><body><div id="nasama-print-stage"><img alt="Nasama receipt" src="' + imageSrc + '"></div></body></html>'
      );
      doc.close();

      await waitForFrameAssets(frame);

      await new Promise(function (resolve) {
        setTimeout(resolve, 150);
      });

      frame.contentWindow.focus();
      frame.contentWindow.onafterprint = cleanup;
      printStarted = true;
      frame.contentWindow.print();
    } catch (error) {
      console.error("Receipt print failed:", error);
      alert("Print failed: " + error.message);
    } finally {
      button.disabled = false;
      button.textContent = originalText;
      if (printStarted) setTimeout(cleanup, 60000);
      else cleanup();
    }
  }

  document.addEventListener(
    "click",
    function (event) {
      var button = closestDownloadButton(event.target);
      if (!button) return;
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      exportVisibleReceipt(button);
    },
    true
  );

  document.addEventListener(
    "click",
    function (event) {
      var button = closestPrintButton(event.target);
      if (!button) return;
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      printVisibleReceipt(button);
    },
    true
  );
})();
