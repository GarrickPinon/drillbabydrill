const fs = require('fs');

function bump(file) {
    let code = fs.readFileSync(file, 'utf8');
    code = code.replace(/fontSize:\s*(\d+)/g, (m, p1) => { 
        const size = parseInt(p1); 
        return size <= 14 ? `fontSize: ${size + 2}` : size <= 28 ? `fontSize: ${size + 4}` : `fontSize: ${size + 8}`; 
    });
    fs.writeFileSync(file, code);
}

bump('./src/App.jsx');
bump('./src/WeatherPanel.jsx');
console.log("Fonts globally bumped.");
