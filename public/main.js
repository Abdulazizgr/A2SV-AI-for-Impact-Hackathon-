document
  .getElementById("uploadForm")
  .addEventListener("submit", async function (event) {
    event.preventDefault();

    const fileInput = document.getElementById("fileInput");
    const formData = new FormData();
    formData.append("file", fileInput.files[0]);

    try {
      const response = await fetch("http://localhost:3000/api/upload", {
        method: "POST",
        body: formData,
      });

      if (response.ok) {
        const data = await response.json();
        // Display the file content in the <pre> tag
        document.getElementById(
          "result"
        ).innerText = `File content: ${data.text}`;
      } else {
        throw new Error("Network response was not ok");
      }
    } catch (error) {
      document.getElementById("result").innerText = `Error: ${error.message}`;
    }
  });
