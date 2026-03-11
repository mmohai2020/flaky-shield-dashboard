const express = require('express');
const path = require('path');

const app = express();

// Set EJS as templating engine
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Sample data for demonstration
const dashboardData = {
    lastUpdated: new Date().toLocaleString(),
    stats: {
        active: 5,
        total: 20,
        healed: 3,
        averageFlakyScore: 55.4,
        byClient: {
            'Client A': 8,
            'Client B': 5,
            'Client C': 7
        },
        byEnvironment: {
            'Staging': 10,
            'Production': 10
        }
    },
    activeQuarantines: [
        {
            testId: 'test1',
            testName: 'Login Test Flaky',
            filePath: 'tests/auth/login_test.js',
            client: 'Client A',
            environment: 'Staging',
            quarantinedAt: new Date().toISOString(),
            reason: 'Intermittent network issues',
            flakyScore: 75.3
        },
        {
            testId: 'test2',
            testName: 'Payment Processing',
            filePath: 'tests/payment/payment_test.js',
            client: 'Client B',
            environment: 'Production',
            quarantinedAt: new Date().toISOString(),
            reason: 'Flaky API response',
            flakyScore: 65.0
        }
        // Add more test objects as needed
    ]
};

// Route to render the dashboard
app.get('/dashboard', (req, res) => {
    res.render('dashboard', dashboardData);
});

// Static files (if needed)
app.use(express.static('public'));

// Start server
app.listen(3000, () => {
    console.log('Server is running on http://localhost:3000');
});