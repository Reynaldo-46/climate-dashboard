require('dotenv').config();
const express = require('express');
const cors = require('cors');
const axios = require('axios');
const cron = require('node-cron');

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:3000',
  credentials: true
}));
app.use(express.json());

// In-memory cache
let climateCache = {
  co2Data: null,
  tempData: null,
  seaLevelData: null,
  lastUpdated: null
};

// Fetch NASA Temperature Data
async function fetchTemperatureData() {
  try {
    console.log('Fetching temperature data from NASA...');
    const response = await axios.get(
      'https://data.giss.nasa.gov/gistemp/tabledata_v4/GLB.Ts+dSST.json',
      { timeout: 10000 }
    );
    console.log('✓ Temperature data fetched successfully');
    return response.data;
  } catch (error) {
    console.error('✗ Error fetching temperature data:', error.message);
    return null;
  }
}

// Fetch NOAA CO2 Data
async function fetchCO2Data() {
  try {
    console.log('Fetching CO2 data from NOAA...');
    const response = await axios.get(
      'https://gml.noaa.gov/webdata/ccgg/trends/co2/co2_weekly_mlo.json',
      { timeout: 10000 }
    );
    console.log('✓ CO2 data fetched successfully');
    return response.data;
  } catch (error) {
    console.error('✗ Error fetching CO2 data:', error.message);
    return null;
  }
}

// Fetch Sea Level Data
async function fetchSeaLevelData() {
  try {
    console.log('Fetching sea level data from NOAA...');
    const endDate = new Date();
    const startDate = new Date();
    startDate.setFullYear(startDate.getFullYear() - 10);
    
    const formatDate = (date) => {
      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const day = String(date.getDate()).padStart(2, '0');
      return `${year}${month}${day}`;
    };
    
    const url = `https://api.tidesandcurrents.noaa.gov/api/prod/datagetter?` +
      `product=monthly_mean&` +
      `application=ClimateApp&` +
      `station=8454000&` +
      `begin_date=${formatDate(startDate)}&` +
      `end_date=${formatDate(endDate)}&` +
      `datum=MLLW&` +
      `units=metric&` +
      `time_zone=gmt&` +
      `format=json`;
    
    const response = await axios.get(url, { timeout: 10000 });
    console.log('✓ Sea level data fetched successfully');
    return response.data;
  } catch (error) {
    console.error('✗ Error fetching sea level data:', error.message);
    return null;
  }
}

// Update all climate data
async function updateClimateData() {
  console.log('\n🌍 Updating climate data...');
  console.log('Time:', new Date().toISOString());
  
  const [tempData, co2Data, seaLevelData] = await Promise.all([
    fetchTemperatureData(),
    fetchCO2Data(),
    fetchSeaLevelData()
  ]);

  climateCache = {
    co2Data,
    tempData,
    seaLevelData,
    lastUpdated: new Date().toISOString()
  };

  console.log('✓ Climate data cache updated successfully\n');
}

// Schedule data updates every 6 hours
cron.schedule('0 */6 * * *', () => {
  console.log('🕐 Scheduled update triggered');
  updateClimateData();
});

// Initial data fetch on server start
updateClimateData();

// API Routes

// Health check
app.get('/api/health', (req, res) => {
  res.json({
    success: true,
    message: 'Climate API is running',
    uptime: process.uptime(),
    lastDataUpdate: climateCache.lastUpdated
  });
});

// Get all climate data
app.get('/api/climate/all', (req, res) => {
  if (!climateCache.lastUpdated) {
    return res.status(503).json({
      success: false,
      message: 'Data is being loaded, please try again in a moment'
    });
  }

  res.json({
    success: true,
    data: climateCache,
    lastUpdated: climateCache.lastUpdated
  });
});

// Get CO2 data only
app.get('/api/climate/co2', (req, res) => {
  res.json({
    success: true,
    data: climateCache.co2Data,
    lastUpdated: climateCache.lastUpdated
  });
});

// Get temperature data only
app.get('/api/climate/temperature', (req, res) => {
  res.json({
    success: true,
    data: climateCache.tempData,
    lastUpdated: climateCache.lastUpdated
  });
});

// Get sea level data only
app.get('/api/climate/sealevel', (req, res) => {
  res.json({
    success: true,
    data: climateCache.seaLevelData,
    lastUpdated: climateCache.lastUpdated
  });
});

// Manual refresh endpoint
app.post('/api/climate/refresh', async (req, res) => {
  try {
    await updateClimateData();
    res.json({
      success: true,
      message: 'Data refreshed successfully',
      lastUpdated: climateCache.lastUpdated
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to refresh data',
      error: error.message
    });
  }
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: 'Endpoint not found'
  });
});

// Error handler
app.use((err, req, res, next) => {
  console.error('Server error:', err);
  res.status(500).json({
    success: false,
    message: 'Internal server error',
    error: process.env.NODE_ENV === 'development' ? err.message : undefined
  });
});

app.listen(PORT, () => {
  console.log('\n🚀 ================================');
  console.log(`🌍 Climate API Server is running!`);
  console.log(`📍 Port: ${PORT}`);
  console.log(`🔗 Base URL: http://localhost:${PORT}`);
  console.log(`📊 Health Check: http://localhost:${PORT}/api/health`);
  console.log(`🌡️  Climate Data: http://localhost:${PORT}/api/climate/all`);
  console.log('================================\n');
});