import DataLayerHelper from '../src/DataLayerHelper';

// TODO: tidy up
function deepEqual(a:any, b:any) {
  expect(JSON.stringify(a)).toEqual(JSON.stringify(b));
}

function ok(a: boolean, b: boolean = false) {
  expect(a).toBeTruthy();
}

describe('DataLayerHelper', function () {
  let dataLayer: any[];

  beforeEach(function() {
    dataLayer = [{ a: 1, b: { c: { d: 4 }, e: 5 } }];
    dataLayer.push({ f: 6 });
    dataLayer.push({ g: 7 });

  });

  it('flatten', function () { 
    const h = new DataLayerHelper(dataLayer);
    dataLayer.push({ g: 8, i: 9 });
    dataLayer.push({ 'b.c': 3 });

    console.log('1');
    deepEqual([
      { a: 1, b: { c: { d: 4 }, e: 5 } },
      { f: 6 },
      { g: 7 },
      { g: 8, i: 9 },
      { 'b.c': 3 }
    ], dataLayer);

    h.flatten();

    console.log('2');
    deepEqual([{
      a: 1,
      b: { c: 3, e: 5 },
      f: 6,
      g: 8,
      i: 9
    }], dataLayer);

    h.flatten();

    deepEqual([{
      a: 1,
      b: { c: 3, e: 5 },
      f: 6,
      g: 8,
      i: 9
    }], dataLayer);

    dataLayer.push({ f: 7, j: 10 });

    deepEqual([
      {
        a: 1,
        b: { c: 3, e: 5 },
        f: 6,
        g: 8,
        i: 9
      },
      {
        f: 7,
        j: 10
      }
    ], dataLayer);

    h.flatten();

    deepEqual([{
      a: 1,
      b: { c: 3, e: 5 },
      f: 7,
      g: 8,
      i: 9,
      j: 10
    }], dataLayer);

  });

  it('get', function() {
    var h = new DataLayerHelper([{
      a: 1,
      b: {
        c: {
          d: 4
        },
        e: 5,
        f: null
      }
    }]);

    expect(h.get('a')).toEqual( 1);
    deepEqual(h.get('b'), {c: {d: 4}, e: 5, f: null});
    deepEqual(h.get('b.c'), {d: 4});
    expect(h.get('b.c.d')).toEqual( 4);
    expect(h.get('b.e')).toEqual( 5);
    expect(h.get('b.f')).toEqual( null);

    expect(h.get('blah')).toEqual( undefined);
    expect(h.get('c')).toEqual( undefined);
    expect(h.get('d')).toEqual( undefined);
    expect(h.get('e')).toEqual( undefined);
  });

  it('Basic Operations', function() {
    var callbacks: any[] = [];
    var expectedCallbackCount = 0;
    function assertCallback(expected: any) {
      expectedCallbackCount++;
      //ok(callbacks.length, expectedCallbackCount);
      deepEqual(callbacks[callbacks.length - 1], expected);
    }
    function callbackListener() {
      callbacks.push([].slice.call(arguments, 0));
    }

    var dataLayer: any[] = [];
    var helper = new DataLayerHelper(dataLayer, callbackListener);

    expect(callbacks.length).toEqual( 0);
    ok(helper.get('one') === undefined);
    ok(helper.get('two') === undefined);

    dataLayer.push({one: 1, two: 2});
    assertCallback([{one: 1, two: 2}, {one: 1, two: 2}]);
    ok(helper.get('one') === 1);
    ok(helper.get('two') === 2);

    dataLayer.push({two: 3});
    assertCallback([{one: 1, two: 3}, {two: 3}]);
    ok(helper.get('one') === 1);
    ok(helper.get('two') === 3);

    dataLayer.push({two: 2});
    assertCallback([{one: 1, two: 2}, {two: 2}]);
    ok(helper.get('one') === 1);
    ok(helper.get('two') === 2);

    dataLayer.push({one: {three: 3}});
    assertCallback([{one: {three: 3}, two: 2}, {one: {three: 3}}]);
    deepEqual(helper.get('one'), {three: 3});
    ok(helper.get('two') === 2);

    dataLayer.push({one: {four: 4}});
    assertCallback([{one: {three: 3, four: 4}, two: 2}, {one: {four: 4}}]);
    deepEqual(helper.get('one'), {three: 3, four: 4});
    ok(helper.get('one.four') === 4);
    ok(helper.get('two') === 2);

    expect(dataLayer.length).toEqual( 5);
    deepEqual(dataLayer, [{one: 1, two: 2}, {two: 3}, {two: 2}, {one: {three: 3}}, {one: {four: 4}}]);
    helper.flatten();
    expect(dataLayer.length).toEqual( 1);
    deepEqual(dataLayer, [{one: {three: 3, four: 4}, two: 2}]);
    deepEqual(helper.get('one'), {three: 3, four: 4});
    ok(helper.get('one.four') === 4);
    ok(helper.get('two') === 2);

    dataLayer.push({five: 5});
    assertCallback([{one: {three: 3, four: 4}, two: 2, five: 5}, {five: 5}]);
    expect(dataLayer.length).toEqual(2);
    ok(helper.get('one.four') === 4);
    ok(helper.get('five') === 5);
  });

  it('Advanced Operations', function() {
    var callbacks:any[] = [];
    var expectedCallbackCount = 0;
    function assertCallback(expected: any) {
      expectedCallbackCount++;
      //ok(callbacks.length, expectedCallbackCount);
      deepEqual(callbacks[callbacks.length - 1], expected);
    }
    function callbackListener() {
      callbacks.push([].slice.call(arguments, 0));
    }

    var dataLayer:any[] = [];
    var helper = new DataLayerHelper(dataLayer, callbackListener);

    expect(callbacks.length).toEqual( 0);
    ok(helper.get('one') === undefined);
    ok(helper.get('two') === undefined);

    // Test pushing a custom method that calls dataLayer.push(). We expect the
    // new message to be appended to the queue and processed last.
    dataLayer.push(
      {a: 'originalValue'},
      function() {
        dataLayer.push({a: 'newValue'});
      });
    ok(helper.get('a') === 'newValue');

    dataLayer.push(
      {numCustomMethodCalls: 0},
      function() {
        var method = function() {
          var numCalls = this.get('numCustomMethodCalls');
          if (numCalls < 10) {
            this.set('numCustomMethodCalls', numCalls + 1);
            dataLayer.push(method);
          }
        };
        dataLayer.push(method);
      })
    ok(helper.get('numCustomMethodCalls') === 10);
  });
});
