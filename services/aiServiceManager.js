const AIServiceConfig = require('../models/AIServiceConfig');

class AIServiceManager {
  constructor() {
    this.config = null;
    this.lastConfigUpdate = null;
  }

  // Get current configuration with caching
  async getCurrentConfig() {
    // Refresh config every 5 minutes or if not loaded
    const now = new Date();
    if (!this.config || !this.lastConfigUpdate || 
        (now - this.lastConfigUpdate) > 5 * 60 * 1000) {
      this.config = await AIServiceConfig.getCurrentConfig();
      this.lastConfigUpdate = now;
    }
    return this.config;
  }

  // Get the AI service to use for a specific task
  async getServiceForTask(taskType) {
    const config = await this.getCurrentConfig();
    return config.getServiceForTask(taskType);
  }

  // Force refresh configuration (useful after updates)
  async refreshConfig() {
    this.config = await AIServiceConfig.getCurrentConfig();
    this.lastConfigUpdate = new Date();
    return this.config;
  }

  // Check if a specific service is available for a task
  async isServiceAvailable(taskType, serviceName) {
    const configuredService = await this.getServiceForTask(taskType);
    return configuredService === serviceName;
  }
}

// Export singleton instance
module.exports = new AIServiceManager();