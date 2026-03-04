/**
 * PonderModuleRegistry — Central registry for site modules.
 *
 * Each module calls PonderModuleRegistry.register({ ... }) to register itself.
 * The core timer calls PonderModuleRegistry.init() once the page is ready,
 * which finds the matching module for the current site and initialises it.
 */
const PonderModuleRegistry = (() => {
  const modules = [];
  let activeModule = null;

  return {
    /**
     * Register a site module.
     * @param {object} mod — must have: name, displayName, matchesSite(location), init(callbacks)
     *   Optional: pause(), getOverlayContainer(), destroy()
     */
    register(mod) {
      if (!mod.name || !mod.matchesSite || !mod.init) {
        console.warn('[Ponder] Module missing required fields:', mod);
        return;
      }
      modules.push(mod);
    },

    /**
     * Find the first registered module that matches the current site and
     * initialise it with the provided callbacks.
     * @param {object} callbacks — { onVideoFound, onVideoChanged, onVideoLost }
     * @returns {object|null} the active module, or null
     */
    init(callbacks) {
      for (const mod of modules) {
        try {
          if (mod.matchesSite(window.location)) {
            activeModule = mod;
            mod.init(callbacks);
            console.log(`[Ponder] Activated module: ${mod.displayName}`);
            return mod;
          }
        } catch (e) {
          console.error(`[Ponder] Error checking module ${mod.name}:`, e);
        }
      }
      return null;
    },

    /** Return the currently active module (or null). */
    getActive() {
      return activeModule;
    },

    /** Destroy the active module and reset state. */
    destroyActive() {
      if (activeModule && activeModule.destroy) {
        try {
          activeModule.destroy();
        } catch (e) {
          console.error('[Ponder] Error destroying module:', e);
        }
      }
      activeModule = null;
    },

    /** List all registered module names (for debugging). */
    list() {
      return modules.map(m => m.name);
    }
  };
})();
