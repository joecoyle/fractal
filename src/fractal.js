/* eslint "import/no-dynamic-require": "off", "handle-callback-err": "off" */

const _ = require('lodash');
const EventEmitter = require('eventemitter2').EventEmitter2;
const utils = require('@frctl/utils');
const fs = require('@frctl/ffs');
const Collection = require('./collection');
const Plugins = require('./plugins');
const Commands = require('./commands');
const Methods = require('./methods');
const Adapters = require('./adapters');
const applyConfig = require('./configure');
const validate = require('./validate');

const refs = {
  src: new WeakMap(),
  adapters: new WeakMap(),
  files: new WeakMap(),
  components: new WeakMap(),
  commands: new WeakMap(),
  transformer: new WeakMap()
};

class Fractal extends EventEmitter {

  /**
   * Insantiate a new Fractal instance
   *
   * @param  {object} [config={}] A configuration object
   * @return {Fractal} The Fractal instance
   */
  constructor(config) {
    validate.config(config);

    super({
      wildcard: true
    });

    refs.files.set(this, {
      methods: new Methods(),
      plugins: new Plugins(),
      state: null
    });

    refs.components.set(this, {
      methods: new Methods(),
      plugins: new Plugins(),
      state: null
    });

    refs.transformer.set(this, () => []);

    refs.commands.set(this, new Commands());
    refs.adapters.set(this, new Adapters());

    if (config) {
      this.configure(config);
    }

    this.on('error', () => {});
  }

  /**
   * Apply configuration options
   *
   * @param  {object} config A config object
   * @return {Fractal} The Fractal instance
   */
  configure(config = {}) {
    this.log('Applying configuration', config);
    return applyConfig(this, config);
  }

  /**
   * Add a filesystem src directory
   *
   * @param  {string|array} src A source path or array of source paths
   * @return {Fractal} The Fractal instance
   */
  addSrc(src) {
    const toAdd = utils.normalizePaths(src);
    const sources = refs.src.get(this) || [];
    toAdd.forEach(src => {
      validate.src(src);
      this.log(`Adding src: ${src}`);
    });
    refs.src.set(this, sources.concat(toAdd));
    return this;
  }

  /**
   * Add a plugin to the specified parser
   *
   * @param  {function} plugin Parser plugin to add
   * @param  {string} [target=components] The parser stack to add the plugin to
   * @return {Fractal} The Fractal instance
   */
  addPlugin(plugin, target = 'components') {
    validate.entityType(target);
    this[target].plugins.use(plugin);
    return this;
  }

  /**
   * Register a collection method
   *
   * Methods are wrapped so that the current fractal instance
   * is always available as the last argument to the method.
   *
   * @param  {string} name The name of the method
   * @param  {function} handler The function to be used as the method
   * @param  {string} [target=components] The collection to apply the method to
   * @return {Fractal} The Fractal instance
   */
  addMethod(name, handler, target = 'components') {
    validate.method({name, handler});
    validate.entityType(target);
    const wrappedHandler = (...args) => handler(args, this.state, this);
    this[target].methods.add({name, handler: wrappedHandler});
    return this;
  }

  /**
   * Register a CLI command
   *
   * @param  {object} command The CLI object to register
   * @return {Fractal} The Fractal instance
   */
  addCommand(command) {
    refs.commands.get(this).add(command);
    return this;
  }

  /**
   * Apply an extension
   *
   * @param  {function} extension The extension wrapper function
   * @return {Fractal} The Fractal instance
   */
  addExtension(extension) {
    validate.extension(extension);
    extension(this);
    return this;
  }

  /**
   * Add a render adapter
   *
   * @param  {object} adapter The adapter object to register
   * @return {Fractal} The Fractal instance
   */
  addAdapter(adapter) {
    refs.adapters.get(this).add(adapter);
    this.addPlugin(require('./adapters/plugin')(adapter), 'files');
    this.addMethod(`render.${adapter.name}`, require('./adapters/render')(adapter));
    return this;
  }

  /**
   * Set the transformer function used for files -> components transformations
   *
   * @param  {function} transformer The transformer function
   * @return {Fractal} The Fractal instance
   */
  setTransformer(transformer) {
    validate.transformer(transformer);
    refs.transformer.set(this, transformer);
    return this;
  }

  /**
   * Read and process all source directories
   *
   * @param  {function} callback A callback function
   * @return {Promise|undefined} A Promise if no callback is defined
   */
  parse(callback) {
    if (!callback) {
      return new Promise((resolve, reject) => {
        this.parse((err, components, files) => {
          if (err) {
            return reject(err);
          }
          resolve({components, files});
        });
      });
    }

    validate.callback(callback);

    this.emit('parse.start');

    const mutate = (data, target) => {
      return target.plugins.process(data, this).then(items => {
        const collection = new Collection(items);
        // bind methods to the collection
        for (const method of target.methods) {
          _.set(collection, method.name, method.handler.bind(collection));
        }
        target.state = collection;
        return target.state;
      });
    };

    fs.readDir(this.src).then(input => {
      return mutate(input || [], this.files)
        .then(files => this.transformer(files.toArray()))
        .then(output => mutate(output, this.components))
        .then(() => {
          const state = [this.components.state, this.files.state];
          this.emit('parse.complete', ...state);
          callback(null, ...state);
        });
    }).catch(err => {
      this.emit('error', err);
      callback(err);
    });
  }

  /**
   * Watch source directories for changes
   *
   * @return {object} Chokidar watch object
   */
  watch(...args) {
    let [callback, paths] = args.reverse();
    paths = utils.toArray(paths || []);
    callback = callback || (() => {});
    return fs.watch(this.src.concat(paths), callback);
  }

  /**
   * Emit a log event
   *
   * @param  {string} message The message string
   * @param  {string} level The log level to use
   * @param  {object} data Optional data object
   * @return {Fractal} The Fractal instance
   */
  log(message, ...args) {
    let [level, data] = typeof args[0] === 'string' ? args : args.reverse();
    level = level || 'debug';
    this.emit(`log.${level}`, message, data, level);
    return this;
  }

  /**
   * The Fractal version specified in the package.json file
   */
  get version() {
    return require('../package.json').version;
  }

  /**
   * The results of the last parse
   */
  get state() {
    return {
      files: this.files.state,
      components: this.components.state
    };
  }

  /**
   * Files object with parser and api properties
   * @return {Object}
   */
  get files() {
    return refs.files.get(this);
  }

  /**
   * Components object with parser and api properties
   * @return {Object}
   */
  get components() {
    return refs.components.get(this);
  }

  /**
   * Transformer function
   * @return {Function}
   */
  get transformer() {
    return refs.transformer.get(this);
  }

  /**
   * An array of all registered and bundled commands
   * @return {Array}
   */
  get commands() {
    return refs.commands.get(this);
  }

  /**
   * An array of registered adapter names => adapters
   * @return {Array} Adapters
   */
  get adapters() {
    return refs.adapters.get(this);
  }

  /**
   * The target src directories
   * @return {Array} Paths array
   */
  get src() {
    return refs.src.get(this) || [];
  }

}

module.exports = Fractal;
