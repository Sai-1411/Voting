const express = require('express');
const bodyParser = require('body-parser');
const sqlite3 = require('sqlite3').verbose();
const cookieParser = require('cookie-parser');
const path = require('path');
const ExcelJS = require('exceljs');

const app = express();
const port = 3000;

// Create SQLite database
const dbPath = path.join(__dirname, 'votes.db');
const db = new sqlite3.Database(dbPath);

// Create table to store submissions if it doesn't exist
db.serialize(() => {
    db.run('CREATE TABLE IF NOT EXISTS submissions (id INTEGER PRIMARY KEY, name TEXT, category TEXT)');
});

// Middleware to parse JSON bodies
app.use(bodyParser.json());

// Use cookie-parser middleware
app.use(cookieParser());

// Serve static files from the public directory
app.use(express.static(path.join(__dirname, 'public')));

// Serve results.html file for the /results endpoint
app.get('/results', (req, res) => {
    res.sendFile(path.join(__dirname, 'results.html'));
});

// Define category names
const categoryNames = {
    category1: 'category1',
    category2: 'category2',
    category3: 'category3',
    category4: 'category4',
    category5: 'category5'
};

// Middleware to check if the user has already voted
function checkIfVoted(req, res, next) {
    const name = req.cookies.name;
    if (name) {
        db.get('SELECT * FROM submissions WHERE name = ?', [name], (err, row) => {
            if (err) {
                return res.status(500).send('Error retrieving data');
            }
            if (row) {
                return res.status(403).send('You have already voted');
            }
            next();
        });
    } else {
        next();
    }
}

// Endpoint to handle form submissions
app.post('/submit', checkIfVoted, (req, res) => {
    const { name, category } = req.body;

    // Insert submission into database
    db.run('INSERT INTO submissions (name, category) VALUES (?, ?)', [name, category], (err) => {
        if (err) {
            return res.status(500).send('Error submitting data');
        }
        // Set a cookie to mark the user as voted
        res.cookie('name', name, { maxAge: 900000, httpOnly: true }); // Cookie expires in 15 minutes
        res.send('Submission received');
    });
});

// Endpoint to display aggregated results
app.get('/resultsData', (req, res) => {
    // Query database to get aggregated results
    db.all('SELECT category, COUNT(*) AS count FROM submissions GROUP BY category', (err, categoryRows) => {
        if (err) {
            return res.status(500).send('Error retrieving category counts');
        }
        // Query database to get total number of users
        db.get('SELECT COUNT(DISTINCT name) AS totalUsers FROM submissions', (err, userRow) => {
            if (err) {
                return res.status(500).send('Error retrieving total users');
            }
            // Query database to get users who have submitted their options in all categories
            db.all('SELECT DISTINCT name FROM submissions', (err, userRows) => {
                if (err) {
                    return res.status(500).send('Error retrieving users');
                }
                res.json({ 
                    totalUsers: userRow.totalUsers,
                    categoryCounts: categoryRows,
                    users: userRows
                });
            });
        });
    });
});

// Endpoint to export aggregated results as Excel
app.get('/exportResults', (req, res) => {
    // Query database to get aggregated results
    db.all('SELECT category, COUNT(*) AS count FROM submissions GROUP BY category', (err, categoryRows) => {
        if (err) {
            return res.status(500).send('Error retrieving category counts');
        }
        // Query database to get total number of users
        db.get('SELECT COUNT(DISTINCT name) AS totalUsers FROM submissions', (err, userRow) => {
            if (err) {
                return res.status(500).send('Error retrieving total users');
            }
            // Query database to get users who have submitted their options in all categories
            db.all('SELECT DISTINCT name FROM submissions', (err, userRows) => {
                if (err) {
                    return res.status(500).send('Error retrieving users');
                }

                // Create a new Excel workbook
                const workbook = new ExcelJS.Workbook();
                const worksheet = workbook.addWorksheet('Results');

                // Add headers to the worksheet
                worksheet.addRow(['Category', 'Count']);
                categoryRows.forEach(row => {
                    worksheet.addRow([categoryNames[row.category], row.count]);
                });

                // Add total users to the worksheet
                worksheet.addRow(['Total Users', userRow.totalUsers]);

                // Add users to the worksheet
                worksheet.addRow([]); // Add an empty row for separation
                worksheet.addRow(['Users']);
                userRows.forEach(row => {
                    worksheet.addRow([row.name]);
                });

                // Set response headers for Excel file download
                res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
                res.setHeader('Content-Disposition', 'attachment; filename="results.xlsx"');

                // Write workbook to response stream
                workbook.xlsx.write(res)
                    .then(() => {
                        res.end();
                    })
                    .catch(err => {
                        console.error('Error writing Excel file:', err);
                        res.status(500).send('Error writing Excel file');
                    });
            });
        });
    });
});

// Start server
app.listen(port, () => {
    console.log(`Server is running on http://localhost:${port}`);
});
