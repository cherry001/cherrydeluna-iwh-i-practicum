require('dotenv').config();
const express = require('express');
const bodyParser = require('body-parser');
const hubspot = require('@hubspot/api-client');

const app = express();
app.set('view engine', 'pug');
app.use(express.static(__dirname + '/public'));
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.json());

// * Please DO NOT INCLUDE the private app access token in your repo. Don't do this practicum in your normal account.
const PORT = process.env.PORT || 3000;
const HUBSPOT_API_KEY = process.env.HUBSPOT_API_KEY;
const HUBSPOT_PROJECT_OBJECT_TYPE = process.env.HUBSPOT_PROJECT_OBJECT_TYPE;

const hubspotClient = new hubspot.Client({ accessToken: HUBSPOT_API_KEY });

// TODO: ROUTE 1 - Create a new app.get route for the homepage to call your custom object data. Pass this data along to the front-end and create a new pug template in the views folder.
app.get('/', async (req, res) => {
  try {
    const apiResponse = await hubspotClient.crm.objects.basicApi.getPage(
      HUBSPOT_PROJECT_OBJECT_TYPE,
      10,
      undefined,
      ['name', 'description', 'status'],
      undefined,
      ['contacts'],
      false
    );

    const projectsWithContacts = apiResponse.results.map(async (project) => {
      const contactCount =
        project.associations && project.associations.contacts
          ? project.associations.contacts.results.length
          : 0;

      let contacts = [];

      if (contactCount > 0) {
        const contactIds = project.associations.contacts.results.map(
          (assoc) => assoc.id
        );

        const contactDetails = await hubspotClient.crm.contacts.batchApi.read({
          inputs: contactIds.map((id) => ({ id })),
          properties: ['firstname', 'lastname'],
        });

        contacts = contactDetails.results.map((contact) => ({
          id: contact.id,
          firstname: contact.properties.firstname,
          lastname: contact.properties.lastname,
        }));
      }

      return {
        project,
        contacts,
      };
    });

    const projects = await Promise.all(projectsWithContacts);
    res.render('index', {
      projects,
    });
  } catch (e) {
    console.error(
      e.message === 'HTTP request failed'
        ? JSON.stringify(e.response, null, 2)
        : e
    );
    res.status(500).send('Error retrieving projects and contacts');
  }
});

// TODO: ROUTE 2 - Create a new app.get route for the form to create or update new custom object data. Send this data along in the next route.
app.get('/update-cobj/:id?', async (req, res) => {
  const projectId = req.params.id;
  let project = null;

  if (projectId) {
    try {
      project = await hubspotClient.crm.objects.basicApi.getById(
        HUBSPOT_PROJECT_OBJECT_TYPE,
        projectId,
        ['name', 'description', 'status']
      );
    } catch (e) {
      console.error(
        e.message === 'HTTP request failed'
          ? JSON.stringify(e.response, null, 2)
          : e
      );
      res.status(500).send('Error retrieving project');
    }
  }

  res.render('update', {
    title: projectId ? 'Update Project' : 'Create Project',
    project,
  });
});

// TODO: ROUTE 3 - Create a new app.post route for the custom objects form to create or update your custom object data. Once executed, redirect the user to the homepage.
app.post('/update-cobj/:id?', async (req, res) => {
  const projectId = req.params.id;
  const { name, description, status } = req.body;

  try {
    if (projectId) {
      await hubspotClient.crm.objects.basicApi.update(
        HUBSPOT_PROJECT_OBJECT_TYPE,
        projectId,
        {
          properties: {
            name,
            description,
            status,
          },
        }
      );
    } else {
      await hubspotClient.crm.objects.basicApi.create(
        HUBSPOT_PROJECT_OBJECT_TYPE,
        {
          properties: {
            name,
            description,
            status,
          },
        }
      );
    }

    res.redirect('/');
  } catch (e) {
    console.error(
      e.message === 'HTTP request failed'
        ? JSON.stringify(e.response, null, 2)
        : e
    );
    res.status(500).send('Error updating project');
  }
});

// This endpoint is used to delete a project
app.post('/delete-cobj/:id', async (req, res) => {
  const projectId = req.params.id;

  try {
    await hubspotClient.crm.objects.basicApi.archive(
      HUBSPOT_PROJECT_OBJECT_TYPE,
      projectId
    );

    res.redirect('/');
  } catch (e) {
    console.error(
      e.message === 'HTTP request failed'
        ? JSON.stringify(e.response, null, 2)
        : e
    );
    res.status(500).send('Error deleting project');
  }
});

// This endpoint is used to retrieve contacts that will be rendered in the add contact form
app.get('/add-contact/:projectId', async (req, res) => {
  const projectId = req.params.projectId;

  try {
    const projectResponse = await hubspotClient.crm.objects.basicApi.getById(
      HUBSPOT_PROJECT_OBJECT_TYPE,
      projectId,
      ['name']
    );
    const project = projectResponse.properties;

    // Retrieve 10 contacts for demonstration purposes
    const contactsResponse = await hubspotClient.crm.contacts.basicApi.getPage(
      10,
      undefined,
      ['firstname', 'lastname', 'email']
    );

    const contacts = contactsResponse.results.map((contact) => ({
      id: contact.id,
      firstname: contact.properties.firstname,
      lastname: contact.properties.lastname,
      email: contact.properties.email,
    }));

    res.render('add-contact', {
      title: 'Add Contact',
      projectId,
      project,
      contacts,
    });
  } catch (e) {
    console.error(
      e.message === 'HTTP request failed'
        ? JSON.stringify(e.response, null, 2)
        : e
    );
    res.status(500).send('Error retrieving project or contacts');
  }

  // This endpoint is used to associate contacts with a project
  app.post('/add-contact/:projectId', async (req, res) => {
    const projectId = req.params.projectId;
    const contactIds = Array.isArray(req.body.contactIds)
      ? req.body.contactIds
      : [req.body.contactIds];

    const associations = contactIds.map((contactId) => ({
      _from: { id: projectId },
      to: { id: contactId },
      type: 'contact_to_projects', // Ensure this is the correct association type
    }));

    const BatchInputPublicAssociation = { inputs: associations };
    const fromObjectType = HUBSPOT_PROJECT_OBJECT_TYPE;
    const toObjectType = 'contacts';

    try {
      await hubspotClient.crm.associations.batchApi.create(
        fromObjectType,
        toObjectType,
        BatchInputPublicAssociation
      );

      res.redirect('/');
    } catch (e) {
      e.message === 'HTTP request failed'
        ? console.error(JSON.stringify(e.response, null, 2))
        : console.error(e);
      res.status(500).send('Error adding contacts to project');
    }
  });
});

// * Localhost
app.listen(PORT, () => console.log(`Listening on http://localhost:${PORT}`));
