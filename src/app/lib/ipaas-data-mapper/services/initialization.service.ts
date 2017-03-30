/*
	Copyright (C) 2017 Red Hat, Inc.

	Licensed under the Apache License, Version 2.0 (the "License");
	you may not use this file except in compliance with the License.
	You may obtain a copy of the License at

	        http://www.apache.org/licenses/LICENSE-2.0

	Unless required by applicable law or agreed to in writing, software
	distributed under the License is distributed on an "AS IS" BASIS,
	WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
	See the License for the specific language governing permissions and
	limitations under the License.
*/

import { Injectable } from '@angular/core';
import { Headers, Http, RequestOptions, Response, HttpModule } from '@angular/http';
import 'rxjs/add/operator/toPromise';
import { Observable } from 'rxjs/Rx';
import 'rxjs/add/observable/forkJoin';
import { Subject } from 'rxjs/Subject';

import { ConfigModel } from '../models/config.model';
import { Field, EnumValue } from '../models/field.model';
import { DocumentDefinition } from '../models/document.definition.model';
import { MappingDefinition } from '../models/mapping.definition.model';

import { ErrorHandlerService } from './error.handler.service';

@Injectable()
export class InitializationService {	
	public cfg: ConfigModel;
	private mappingInitialized: boolean = false;

	private systemInitializedSource = new Subject<void>();
	systemInitialized$ = this.systemInitializedSource.asObservable();	
	
	public initialize(): void {
		this.cfg.documentService.initialize();
		this.cfg.mappingService.initialize();

		//load documents
		if (this.cfg.classPath) {
			this.fetchDocuments();
		} else {
			//fetch class path					
			this.cfg.documentService.fetchClassPath().subscribe(
				(classPath: string) => { 
					this.cfg.classPath = classPath;
					console.log("ClassPath was fetched: " + classPath);
					this.fetchDocuments();
					this.updateStatus();
				},
				(error: any) => { 
					console.error("error caught loading doc in initialize service", error); 
				}
			);			
		}		

		//load mappings
		if (this.cfg.mappings != null) {
			console.log("Mapping data already provided, not loading.");
			this.mappingInitialized = true;
			this.updateStatus();
		} else {
			this.cfg.mappings = new MappingDefinition();
			if (this.cfg.mappingFiles.length > 0) {
				this.fetchMappings(this.cfg.mappingFiles);
			} else {
				console.log("Discovering mapping files.");
				this.cfg.mappingService.findMappingFiles("UI").subscribe(
					(files: string[]) => { this.fetchMappings(files); },
					(error: any) => { 
						console.error("Error caught loading mapping file names", error); 
						this.mappingInitialized = true;
						this.updateStatus();
					}
				);
			}		
		}
	}

	private fetchDocuments(): void {
		console.log("Loading source/target documents.");
		for (let docDef of this.cfg.getAllDocs()) {
			this.cfg.documentService.fetchDocument(docDef, this.cfg.classPath).subscribe(
				(docDef: DocumentDefinition) => { 
					console.log("Document was loaded: " + docDef.name, docDef);
					this.updateStatus();
				},
				(error: any) => { 
					console.error("error caught loading doc in initialize service", error); 
					docDef.initCfg.errorOccurred = true;
				}
			);
		}
	}

	private fetchMappings(mappingFiles: string[]): void {
		console.log("Loading mappings from files: " + mappingFiles, mappingFiles);
		if (mappingFiles.length == 0) {
			console.log("No mapping files to load.")
			this.mappingInitialized = true;
			this.updateStatus();
			return;
		}
		this.cfg.mappingService.fetchMappings(mappingFiles, this.cfg.mappings).subscribe(
			(result:boolean) => {
				console.log("Finished loading mapping files.");
				this.mappingInitialized = true;
				this.updateStatus();
			},
			(error: any) => { 
				console.error("error caught loading mappings in initialize service", error); 
				this.mappingInitialized = true;
				this.updateStatus();
			}
		);
	}

	private updateStatus(): void {
		var documentCount: number = this.cfg.getAllDocs().length;
		var finishedDocCount: number = 0;
		for (let docDef of this.cfg.getAllDocs()) {
			if (docDef.initCfg.initialized || docDef.initCfg.errorOccurred) {
				finishedDocCount++;
			}
		}
		
		console.log("Document load status: " + finishedDocCount + " of " + documentCount
			+ "\nMapping load status: " + (this.mappingInitialized ? "Loaded" : "Loading"));
		
		if ((documentCount == finishedDocCount) && this.mappingInitialized) {
			console.log("All documents and mappings are loaded, initializing data.");
			this.cfg.mappings.detectTableIdentifiers(this.cfg);
			for (let d of this.cfg.getAllDocs()) {
				d.updateFromMappings(this.cfg.mappings.mappings);
			}
			this.cfg.initialized = true;
			this.systemInitializedSource.next();
			console.log("System finished initializing.");
		}
		
	}
	
}