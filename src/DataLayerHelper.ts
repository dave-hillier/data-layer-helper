/**
 * @fileoverview Data layer helper library.
 *
 * The dataLayer is a shared queue of objects holding generic information
 * about the page. It uses a standard set of keys so it can be read by anyone
 * that understands the spec (The spec is still under construction). It uses
 * a queue so that the page can record changes to its state. For example, a
 * page might start with the following dataLayer in its head section:
 *
 *   const dataLayer = [{
 *     title: 'Original page title'
 *   }];
 *
 * But in many situations (like an Ajax app), the state/data of the page can
 * change. Using a queue allows the page to update the data when that happens.
 * For example, if the title should change, the page can do this:
 *
 *   dataLayer.push({title: 'New page title'});
 *
 * Strictly speaking, this could have been done without a queue. But using a
 * queue allows readers of the dataLayer to come along at any time and process
 * the entire history of the page's data. This is especially useful for things
 * that load asynchronously or are deferred until long after the page
 * originally loads. But most importantly, using a queue allows all this
 * functionality without requiring a synchronous bootloader script slowing down
 * the page.
 *
 * @author bkuhn@google.com (Brian Kuhn)
 */

import * as plain from './is_plain_object'

if (!Array.isArray) { // TODO: <IE9
  Array.isArray = function(arg:any): arg is any[] {
    return Object.prototype.toString.call(arg) === '[object Array]';
  };
}

/**
 * Determines if the given value is a string.
 *
 * @param {*} value The value to test.
 * @return {boolean} True iff the given value is a string.
 * @private
 */
function isString(value: any): value is string {
  return typeof value === 'string';
};


export interface Model {
  [key: string]: any;
}

/**
 * Merges one object into another or one array into another. Scalars and
 * "non-plain" objects are overwritten when there is a merge conflict.
 * Arrays and "plain" objects are merged recursively.
 *
 * TODO(bkuhn): This is just a starting point for how we'll decide which
 * objects get cloned and which get copied. More work is needed to flesh
 * out the details here.
 *
 * @param {Object|Array} from The object or array to merge from.
 * @param {Object|Array} to The object or array to merge into.
 */
export function merge(from: Model, to: Model) {
  for (const property in from) {
    if (plain.hasOwn(from, property)) {
      const fromProperty = from[property];
      if (Array.isArray(fromProperty)) {
        if (!Array.isArray(to[property])) 
          to[property] = [];
        merge(fromProperty, to[property]);
      } else if (plain.isPlainObject(fromProperty)) {
        if (!plain.isPlainObject(to[property])) 
          to[property] = {};
        merge(fromProperty, to[property]);
      } else {
        to[property] = fromProperty;
      }
    }
  }
};

/**
 * Converts the given key value pair into an object that can be merged onto
 * another object. Specifically, this method treats dots in the key as path
 * separators, so the key/value pair:
 *
 *   'a.b.c', 1
 *
 * will become the object:
 *
 *   {a: {b: {c: 1}}}
 *
 * @param {string} key The key's path, where dots are the path separators.
 * @param {*} value The value to set on the given key path.
 * @return {Object} An object representing the given key/value which can be
 *     merged onto the dataLayer's model.
 */
function expandKeyValue(key: string, value: any): Model {
  const result: Model = {};
  let target: Model = result;
  const split = key.split('.');
  for (let i = 0; i < split.length - 1; i++) {
    target = target[split[i]] = {};
  }
  target[split[split.length - 1]] = value;
  return result;
};

interface AbstractModel {
  get(key: string): any;
  set(key: string, value: any): void;
}

/**
 * Helper function that will build the abstract model interface using the
 * supplied dataLayerHelper.
 *
 * @param {DataLayerHelper} dataLayerHelper The helper class to construct the
 *     abstract model interface for.
 * @return {Object} The interface to the abstract data layer model that is given
 *     to Custom Methods.
 */
class AbstractModelInterface implements AbstractModel {
    constructor(private dataLayerHelper: DataLayerHelper) {

    }

    set (key:string, value: any): void {
      merge(expandKeyValue(key, value), this.dataLayerHelper.model);
    }

    get (key:string): any {
      return this.dataLayerHelper.get(key);
    }
};

/**
 * Applies the given method to the value in the dataLayer with the given key.
 * If the method is a valid function of the value, the method will be applies
 * with any arguments passed in.
 *
 * @param {Array.<Object>} command The array containing the key with the
 *     method to execute and optional arguments for the method.
 * @param {Object|Array} model The current dataLayer model.
 * @private
 */
function processCommand(command: string[], model: Model) {
  if (!isString(command[0])) return;
  const path = command[0].split('.');
  const method = path.pop();
  const args = command.slice(1);
  let target = model;
  for (let i = 0; i < path.length; i++) {
    if (target[path[i]] === undefined) return;
    target = target[path[i]];
  }
  try {
    target[method].apply(target, args);
  } catch (e) {
    // Catch any exception so we don't drop subsequent updates.
    // TODO: Add some sort of logging here when this happens.
  }
};

type UpdateFunction = () => void;
type Update = Model | string[] | UpdateFunction;

function isModel(value: any): value is Model {
  return plain.isPlainObject(value);
}
/**
 * Creates a new helper object for the given dataLayer.
 *
 * @constructor
 * @param {!Array.<!Object>} dataLayer The dataLayer to help with.
 * @param {function(!Object, !Object)=} listener The callback function to
 *     execute when a new state gets pushed onto the dataLayer.
 * @param {boolean=} listenToPast If true, the given listener will be
 *     executed for state changes that have already happened.
 */
export default class DataLayerHelper {

  /**
   * The internal queue of dataLayer updates that have not yet been processed.
   * @type {Array.<Object>}
   * @private
   */
  private readonly unprocessed: Update[] = [];
  /**
   * The internal representation of the dataLayer's state at the time of the
   * update currently being processed.
   * @type {!Object}
   * @private
   */
  readonly model: Model = {};

  /**
   * The interface to the internal dataLayer model that is exposed to custom
   * methods. Custom methods will the executed with this interface as the value
   * of 'this', allowing users to manipulate the model using this.get and
   * this.set.
   * @type {!Object}
   * @private
   */ 
  private readonly abstractModelInterface: AbstractModel;

  executingListener: boolean = false

  constructor(
    private dataLayer: object[], 
    private listener = (...args: any[]) => { }, 
    private listenToPast = false) {

    this.abstractModelInterface = new AbstractModelInterface(this);

    // Process the existing/past states.
    this.processStates(dataLayer, !listenToPast);

    // Add listener for future state changes.
    const oldPush = dataLayer.push;

    dataLayer.push = (...args) => {
      const result = oldPush.apply(dataLayer, args);
      this.processStates(args);
      return result;
    };
  };

  /**
   * Returns the value currently assigned to the given key in the helper's
   * internal model.
   *
   * @param {string} key The path of the key to set on the model, where dot (.)
   *     is the path separator.
   * @return {*} The value found at the given key.
   */
  get(key: string): any {
    let target = this.model;
    const split = key.split('.');
    for (let i = 0; i < split.length; i++) {
      if (target[split[i]] === undefined) return undefined;
      target = target[split[i]];
    }
    return target;
  };


  /**
   * Flattens the dataLayer's history into a single object that represents the
   * current state. This is useful for long running apps, where the dataLayer's
   * history may get very large.
   */
  flatten() {
    this.dataLayer.splice(0, this.dataLayer.length);
    this.dataLayer[0] = {};
    merge(this.model, this.dataLayer[0]);
  };


  /**
   * Merges the given update objects (states) onto the helper's model, calling
   * the listener each time the model is updated. If a command array is pushed
   * into the dataLayer, the method will be parsed and applied to the value found
   * at the key, if a one exists.
   *
   * @param {Array.<Object>} states The update objects to process, each
   *     representing a change to the state of the page.
   * @param {boolean=} skipListener If true, the listener the given states
   *     will be applied to the internal model, but will not cause the listener
   *     to be executed. This is useful for processing past states that the
   *     listener might not care about.
   */
  private processStates(states: Update, skipListener = false) {
    this.unprocessed.push.apply(this.unprocessed, states);
    
    // Checking executingListener here protects against multiple levels of
    // loops trying to process the same queue. This can happen if the listener
    // itself is causing new states to be pushed onto the dataLayer.
    while (this.executingListener === false && this.unprocessed.length > 0) {
      const update = this.unprocessed.shift();
      if (Array.isArray(update)) { 
        processCommand(update, this.model);
      } else if (typeof update === 'function') {
        try {
          update.call(this.abstractModelInterface);
        } catch (e) {
          // Catch any exceptions to we don't drop subsequent updates.
          // TODO: Add some sort of logging when this happens.
        }
      } else if (isModel(update)) {
        for (const key in update) {
          merge(expandKeyValue(key, update[key]), this.model);
        }
      } else {
        continue;
      }
      if (!skipListener) {
        this.executingListener = true;
        this.listener(this.model, update);
        this.executingListener = false;
      }
    }
  };
}

