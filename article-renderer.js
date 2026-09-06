(function () {
  function escapeHtml(value) {
    return String(value).replace(/[&<>"']/g, (character) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;"
    })[character]);
  }

  function safeUrl(value) {
    try {
      const url = new URL(value, window.location.origin);
      return ["http:", "https:", "mailto:"].includes(url.protocol) ? url.href : "#";
    } catch { return "#"; }
  }

  function inlineMarkdown(value) {
    const links = [];
    let prepared = String(value).replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_, label, href) => {
      const token = `\u0000LINK${links.length}\u0000`;
      links.push(`<a href="${escapeHtml(safeUrl(href))}" target="_blank" rel="noopener noreferrer">${escapeHtml(label)}</a>`);
      return token;
    });
    prepared = escapeHtml(prepared)
      .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
      .replace(/(^|[^*])\*([^*]+)\*/g, "$1<em>$2</em>");
    links.forEach((link, index) => { prepared = prepared.replace(`\u0000LINK${index}\u0000`, link); });
    return prepared;
  }

  window.FE_DE_RATAS_RENDER_MARKDOWN = function renderMarkdown(markdown) {
    const lines = String(markdown || "").replace(/\r/g, "").split("\n");
    const output = [];
    let paragraph = [];
    let list = null;

    function flushParagraph() {
      if (paragraph.length) output.push(`<p>${paragraph.map(inlineMarkdown).join("<br>")}</p>`);
      paragraph = [];
    }
    function flushList() {
      if (list) output.push(`<${list.type}>${list.items.map((item) => `<li>${inlineMarkdown(item)}</li>`).join("")}</${list.type}>`);
      list = null;
    }

    lines.forEach((line) => {
      const heading = line.match(/^(#{2,3})\s+(.+)$/);
      const quote = line.match(/^>\s?(.*)$/);
      const unordered = line.match(/^[-*]\s+(.+)$/);
      const ordered = line.match(/^\d+\.\s+(.+)$/);
      if (!line.trim()) { flushParagraph(); flushList(); return; }
      if (heading) { flushParagraph(); flushList(); output.push(`<h${heading[1].length}>${inlineMarkdown(heading[2])}</h${heading[1].length}>`); return; }
      if (quote) { flushParagraph(); flushList(); output.push(`<blockquote>${inlineMarkdown(quote[1])}</blockquote>`); return; }
      if (unordered || ordered) {
        flushParagraph();
        const type = unordered ? "ul" : "ol";
        if (list && list.type !== type) flushList();
        if (!list) list = { type, items: [] };
        list.items.push((unordered || ordered)[1]);
        return;
      }
      flushList();
      paragraph.push(line);
    });
    flushParagraph(); flushList();
    return output.join("");
  };

  window.FE_DE_RATAS_HTML_TO_MARKDOWN = function htmlToMarkdown(html) {
    const template = document.createElement("template");
    template.innerHTML = String(html || "");

    function convert(node) {
      if (node.nodeType === Node.TEXT_NODE) return node.textContent;
      if (node.nodeType !== Node.ELEMENT_NODE) return "";
      const tag = node.tagName.toLowerCase();
      const content = Array.from(node.childNodes).map(convert).join("");
      if (tag === "strong" || tag === "b") return `**${content}**`;
      if (tag === "em" || tag === "i") return `*${content}*`;
      if (tag === "a") return `[${content}](${safeUrl(node.getAttribute("href") || "")})`;
      if (tag === "h2") return `\n\n## ${content}\n\n`;
      if (tag === "h3") return `\n\n### ${content}\n\n`;
      if (tag === "blockquote") return `\n\n${content.split("\n").filter(Boolean).map((line) => `> ${line}`).join("\n")}\n\n`;
      if (tag === "li") return `${content}\n`;
      if (tag === "ul") return `\n${Array.from(node.children).map((item) => `- ${Array.from(item.childNodes).map(convert).join("")}`).join("\n")}\n`;
      if (tag === "ol") return `\n${Array.from(node.children).map((item, index) => `${index + 1}. ${Array.from(item.childNodes).map(convert).join("")}`).join("\n")}\n`;
      if (tag === "br") return "\n";
      if (["p", "div"].includes(tag)) return `${content}\n\n`;
      return content;
    }

    return Array.from(template.content.childNodes)
      .map(convert)
      .join("")
      .replace(/\u00a0/g, " ")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
  };
})();
