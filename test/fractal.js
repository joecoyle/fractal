'use strict';

const Path            = require('path');
const chai            = require('chai');
const chaiAsPromised  = require('chai-as-promised');
const sinon           = require('sinon');
const expect          = chai.expect;

const fractal         = require('../src/fractal');
const ComponentSource = require('../src/components/source');
const PageSource      = require('../src/pages/source');
const config          = require('../config.js');

chai.use(chaiAsPromised);

describe('fractal', function(){

    describe('fractal.engine()', function(){
        it('adds an engine', function(){
            fractal.engine('foo', 'fooEngine', {foo:'bar'});
            expect(fractal.engine('foo')).to.be.an('object');
        });
        it('does not require configuration', function(){
            fractal.engine('bar', 'barEngine');
            const engine = fractal.engine('bar');
            expect(engine).to.be.an.an('object');
        });
        it('returns an uninstantiated engine description', function(){
            const config = {foo:'bar'};
            fractal.engine('baz', 'bazEngine', config);
            const engine = fractal.engine('baz');
            expect(engine).to.be.an.an('object');
            expect(engine).to.have.a.property('engine');
            expect(engine).to.have.a.property('config');
            expect(engine.config).to.equal(config);
            expect(engine.engine).to.equal('bazEngine');
        });
        it('returns the fractal instance when setting', function(){
            expect(fractal.engine('bar', 'barEngine', {foo:'bar'})).to.equal(fractal);
        });
    });

    describe('fractal.load()', function(){
        it('returns a promise that resolves to an object of loaded sources', function(){
            const prom = fractal.load();
            expect(prom).to.eventually.be.an('object');
            expect(prom).to.eventually.have.a.property('components');
            expect(prom).to.eventually.have.a.property('pages');
            expect(prom.then(p => p.components)).to.eventually.equal(fractal.components);
            expect(prom.then(p => p.pages)).to.eventually.equal(fractal.pages);
        });
        it('calls load() on all sources', function(){
            const components       = fractal.source('components');
            const pages            = fractal.source('pages');
            const componentLoadSpy = sinon.spy(components, 'load');
            const pageLoadSpy      = sinon.spy(pages, 'load');
            return fractal.load().then(() => {
                expect(componentLoadSpy.calledOnce).to.be.true;
                expect(pageLoadSpy.calledOnce).to.be.true;;
            });
        });
    });

    describe('fractal.source(type)', function(){
        it('returns a ComponentSource singleton when type is \'component\'', function(){
            expect(fractal.source('components')).to.be.an.instanceof(ComponentSource);
            expect(fractal.source('components')).to.equal(fractal.source('components'));
        });
        it('returns a PageSource singleton when type is \'page\'', function(){
            expect(fractal.source('pages')).to.be.an.instanceof(PageSource);
            expect(fractal.source('pages')).to.equal(fractal.source('pages'));
        });
    });

    describe('fractal.components', function(){
        it('is a ComponentSource singleton', function(){
            expect(fractal.components).to.be.an.instanceof(ComponentSource);
            expect(fractal.components).to.equal(fractal.components);
        });
    });

    describe('fractal.pages', function(){
        it('is a PageSource singleton', function(){
            expect(fractal.pages).to.be.an.instanceof(PageSource);
            expect(fractal.pages).to.equal(fractal.pages);
        });
    });

    describe('fractal.set()', function(){
        it('sets a config value', function(){
            fractal.set('foo', 'bar');
            expect(fractal.get('foo')).to.equal('bar');
        });
        it('returns the fractal instance', function(){
            expect(fractal.set('foobar', 'foobar')).to.equal(fractal);
        });
    });

    describe('fractal.get()', function(){
        it('gets a config value', function(){
            fractal.set('bar', 'foo');
            expect(fractal.get('bar')).to.equal('foo');
        });
        it('returns undefined if not set', function(){
            expect(fractal.get('xyxyxyx')).to.equal(undefined);
        });
        it('returns the full configuration object if called without arguments', function(){
            expect(fractal.get()).to.equal(config);
        });
    });

    // it('should inherit from event emitter', function(done){
    //     fractal.on('foobar', function(){});
    //     fractal.emit('foobar');
    // });

});