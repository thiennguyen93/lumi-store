// The sheet that shows the licence or the third-party notices
// (document.html). The About tab opens it with `{doc}` as its data; the text
// is one of the two files shipped beside it, never a path the data names.

const DOCUMENTS = {
  licence: { file: "LICENSE.txt", title: "GNU General Public License", subtitle: "Version 2, or any later version" },
  notices: { file: "THIRD-PARTY-NOTICES.txt", title: "Third-party notices", subtitle: "The work this extension is built on, and its licences" },
};

const close = () => fetch("/__lumi__/sheet", { method: "DELETE" }).catch(() => {});

document.getElementById("done").addEventListener("click", close);
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" || event.key === "Enter") {
    event.preventDefault();
    close();
  }
});

// Asked for as the page loads, and the text chained from it, so Lumi shows
// the sheet filled in rather than empty (it waits on these `fetch`es).
fetch("/__lumi__/sheet")
  .then((answer) => answer.json())
  .then(({ data }) => {
    const doc = DOCUMENTS[data && data.doc] || DOCUMENTS.licence;
    document.getElementById("title").textContent = doc.title;
    document.getElementById("subtitle").textContent = doc.subtitle;
    return fetch(doc.file);
  })
  .then((answer) => {
    if (!answer.ok) throw new Error(String(answer.status));
    return answer.text();
  })
  .then((text) => {
    document.getElementById("text").textContent = text;
  })
  .catch(() => {
    document.getElementById("text").textContent = "This file could not be read.";
  });
